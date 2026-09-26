"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/auth";
import { actionError, actionSuccess, zodActionError, type ActionState } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Tech stack & cost planner                                         */
/* ------------------------------------------------------------------ */

const selectionSchema = z.object({
  projectId: z.string().min(1),
  serviceId: z.string().min(1),
  quantity: z.coerce.number().min(0).max(1_000_000),
  notes: z.string().max(2000).default(""),
  config: z.string().default(""),
});

/** formData.get() can return a File, so text fields are coerced explicitly. */
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function parseConfig(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (!raw.trim()) return { ok: true, value: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, message: "Config must be a JSON object." };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, message: "Config is not valid JSON." };
  }
}

/** Adds or updates the project's selection for a service (one row per service). */
export async function upsertServiceSelectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = selectionSchema.safeParse({
    projectId: field(formData, "projectId"),
    serviceId: field(formData, "serviceId"),
    quantity: field(formData, "quantity"),
    notes: field(formData, "notes"),
    config: field(formData, "config"),
  });
  if (!parsed.success) return zodActionError(parsed.error);

  const config = parseConfig(parsed.data.config);
  if (!config.ok) return actionError(config.message);

  const guard = await requireProjectAccess(parsed.data.projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  // service_selections has a unique (project_id, service_id) constraint, so an
  // upsert keeps a single row per service instead of duplicating it.
  const { error } = await guard.supabase.from("service_selections").upsert(
    {
      project_id: parsed.data.projectId,
      service_id: parsed.data.serviceId,
      quantity: parsed.data.quantity,
      notes: parsed.data.notes,
      config: config.value,
    },
    { onConflict: "project_id,service_id" },
  );

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${parsed.data.projectId}/stack`);
  return actionSuccess("Selection saved.");
}

export async function deleteServiceSelectionAction(formData: FormData): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const selectionId = String(formData.get("selectionId") ?? "");
  if (!projectId || !selectionId) return actionError("Missing project or selection.");

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  const { error } = await guard.supabase
    .from("service_selections")
    .delete()
    .eq("id", selectionId)
    .eq("project_id", projectId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/stack`);
  return actionSuccess("Selection removed.");
}

/* ------------------------------------------------------------------ */
/*  Architecture decision records (ADR)                               */
/* ------------------------------------------------------------------ */

const adrSchema = z.object({
  projectId: z.string().min(1),
  adrId: z.string().optional(),
  title: z.string().min(1, "Title is required.").max(300),
  status: z.enum(["proposed", "accepted", "rejected", "superseded"]),
  context: z.string().max(8000).default(""),
  decision: z.string().max(8000).default(""),
  consequences: z.string().max(8000).default(""),
  alternatives: z.string().max(8000).default(""),
  tags: z.string().max(500).default(""),
});

function parseTagList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

export async function saveAdrAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = adrSchema.safeParse({
    projectId: field(formData, "projectId"),
    adrId: field(formData, "adrId") || undefined,
    title: field(formData, "title"),
    status: field(formData, "status"),
    context: field(formData, "context"),
    decision: field(formData, "decision"),
    consequences: field(formData, "consequences"),
    alternatives: field(formData, "alternatives"),
    tags: field(formData, "tags"),
  });
  if (!parsed.success) return zodActionError(parsed.error);

  const guard = await requireProjectAccess(parsed.data.projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  const tags = parseTagList(parsed.data.tags);
  const row = {
    project_id: parsed.data.projectId,
    title: parsed.data.title.trim(),
    status: parsed.data.status,
    context: parsed.data.context,
    decision: parsed.data.decision,
    consequences: parsed.data.consequences,
    alternatives: parsed.data.alternatives,
    tags,
  };

  if (parsed.data.adrId) {
    const { error } = await guard.supabase
      .from("adrs")
      .update(row)
      .eq("id", parsed.data.adrId)
      .eq("project_id", parsed.data.projectId);
    if (error) return actionError(error.message);
  } else {
    // Numbers are sequential per project and must never collide, so the next
    // value is read and claimed together rather than computed client-side.
    const { data: last, error: readError } = await guard.supabase
      .from("adrs")
      .select("number")
      .eq("project_id", parsed.data.projectId)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) return actionError(readError.message);

    const { error } = await guard.supabase.from("adrs").insert({
      ...row,
      number: (last?.number ?? 0) + 1,
      created_by: guard.userId,
    });
    if (error) {
      // 23505 = unique violation on (project_id, number): another member
      // claimed the same number concurrently.
      return actionError(
        error.code === "23505"
          ? "Another decision was created at the same time. Please try again."
          : error.message,
      );
    }
  }

  revalidatePath(`/projects/${parsed.data.projectId}/decisions`);
  return actionSuccess(parsed.data.adrId ? "Decision updated." : "Decision created.");
}

export async function deleteAdrAction(formData: FormData): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const adrId = String(formData.get("adrId") ?? "");
  if (!projectId || !adrId) return actionError("Missing project or decision.");

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  const { error } = await guard.supabase
    .from("adrs")
    .delete()
    .eq("id", adrId)
    .eq("project_id", projectId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/decisions`);
  return actionSuccess("Decision deleted.");
}

/* ------------------------------------------------------------------ */
/*  Saved documents                                                   */
/* ------------------------------------------------------------------ */

const documentSchema = z.object({
  projectId: z.string().min(1),
  documentId: z.string().optional(),
  title: z.string().min(1, "Title is required.").max(300),
  kind: z.enum(["architecture", "api", "adr", "cost", "custom"]),
  content: z.string().max(400_000),
});

export async function saveDocumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = documentSchema.safeParse({
    projectId: field(formData, "projectId"),
    documentId: field(formData, "documentId") || undefined,
    title: field(formData, "title"),
    kind: field(formData, "kind"),
    content: field(formData, "content"),
  });
  if (!parsed.success) return zodActionError(parsed.error);

  const guard = await requireProjectAccess(parsed.data.projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  if (parsed.data.documentId) {
    const { error } = await guard.supabase
      .from("documents")
      .update({ title: parsed.data.title, content_markdown: parsed.data.content })
      .eq("id", parsed.data.documentId)
      .eq("project_id", parsed.data.projectId);
    if (error) return actionError(error.message);
  } else {
    const { error } = await guard.supabase.from("documents").insert({
      project_id: parsed.data.projectId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      content_markdown: parsed.data.content,
      created_by: guard.userId,
    });
    if (error) return actionError(error.message);
  }

  revalidatePath(`/projects/${parsed.data.projectId}/docs`);
  return actionSuccess(parsed.data.documentId ? "Document updated." : "Document saved.");
}

export async function deleteDocumentAction(formData: FormData): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  if (!projectId || !documentId) return actionError("Missing project or document.");

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  const { error } = await guard.supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("project_id", projectId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/docs`);
  return actionSuccess("Document deleted.");
}
