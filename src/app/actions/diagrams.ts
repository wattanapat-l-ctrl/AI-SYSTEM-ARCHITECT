"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/auth";

import { actionError, actionSuccess, asUuid, type ActionState } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/**
 * The canvas serialises to the same shape it persists:
 *   node -> { id, type, position: {x,y}, data: {...} }
 *   edge -> { id, source, target, type, data: {...} }
 * `analysis.ts` and `docs.ts` read this exact shape, so it stays canonical.
 */
const nodeDataSchema = z.object({
  label: z.string().max(200).optional(),
  kind: z.string().max(40).optional(),
  layer: z.string().max(40).optional(),
  technology: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  responsibility: z.string().max(2000).optional(),
  criticality: z.enum(["low", "medium", "high"]).optional(),
  replication: z.string().max(500).optional(),
  notes: z.string().max(4000).optional(),
});

const nodeSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.string().max(40).optional(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  data: nodeDataSchema.optional(),
});

const edgeDataSchema = z.object({
  protocol: z.string().max(80).optional(),
  direction: z.enum(["sync", "async", "batch", "stream"]).optional(),
  description: z.string().max(1000).optional(),
  auth: z.string().max(200).optional(),
  sla: z.string().max(200).optional(),
  label: z.string().max(200).optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.string().max(40).optional(),
  source: z.string().min(1).max(80),
  target: z.string().min(1).max(80),
  data: edgeDataSchema.optional(),
});

const saveSchema = z.object({
  projectId: z.string().uuid(),
  diagramId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  nodes: z.array(nodeSchema).max(500),
  edges: z.array(edgeSchema).max(1500),
  viewport: z
    .object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().finite() })
    .partial()
    .optional(),
});

const DIAGRAM_KIND_VALUES = [
  "c4_context",
  "c4_container",
  "c4_component",
  "infrastructure",
  "data_flow",
  "deployment",
] as const;

const kindSchema = z.enum(DIAGRAM_KIND_VALUES, {
  error: "Choose one of the available diagram templates.",
});

const jsonArray = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/* ------------------------------------------------------------------ */
/*  Diagram CRUD                                                       */
/* ------------------------------------------------------------------ */

export async function createDiagramAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kindResult = kindSchema.safeParse(String(formData.get("kind") ?? "c4_container"));
  const description = String(formData.get("description") ?? "").trim();

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);
  const { supabase, userId } = guard;

  if (name.length < 2) {
    return actionError("Give the diagram a name.", { name: "Required" });
  }

  if (!kindResult.success) {
    return actionError("Choose a template.", { kind: kindResult.error.issues[0]?.message ?? "Invalid" });
  }

  const { data, error } = await supabase
    .from("diagrams")
    .insert({
      project_id: projectId,
      name,
      kind: kindResult.data,
      description,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/architecture`);
  return actionSuccess(data.id);
}

export async function updateDiagramMetaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const diagramId = String(formData.get("diagramId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const kindResult = kindSchema.safeParse(String(formData.get("kind") ?? "c4_container"));

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);
  const { supabase } = guard;

  if (!kindResult.success) {
    return actionError("Choose a template.", { kind: kindResult.error.issues[0]?.message ?? "Invalid" });
  }

  const { error } = await supabase
    .from("diagrams")
    .update({ name: name || "Untitled diagram", description, kind: kindResult.data })
    .eq("id", diagramId)
    .eq("project_id", projectId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/architecture`);
  revalidatePath(`/projects/${projectId}/architecture/${diagramId}`);
  return actionSuccess("Diagram updated.");
}

export async function deleteDiagramAction(formData: FormData): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const diagramId = String(formData.get("diagramId") ?? "");
  if (!projectId || !diagramId) return actionError("Missing project or diagram.");

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  const { error } = await guard.supabase
    .from("diagrams")
    .delete()
    .eq("id", diagramId)
    .eq("project_id", projectId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/architecture`);
  return actionSuccess("Diagram deleted.");
}

/* ------------------------------------------------------------------ */
/*  Versioning                                                         */
/* ------------------------------------------------------------------ */

/**
 * Saves the canvas as a new immutable version.
 * `saveAs` records the release note shown in the history list.
 */
export async function saveDiagramVersionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = saveSchema.safeParse({
    projectId: formData.get("projectId"),
    diagramId: formData.get("diagramId"),
    notes: formData.get("notes") ?? "",
    nodes: jsonArray(formData.get("nodes")),
    edges: jsonArray(formData.get("edges")),
    viewport: (() => {
      const raw = formData.get("viewport");
      if (typeof raw !== "string" || !raw) return undefined;
      try {
        const v = JSON.parse(raw);
        return typeof v === "object" && v !== null ? v : undefined;
      } catch {
        return undefined;
      }
    })(),
  });

  if (!parsed.success) {
    return actionError(`Invalid diagram payload: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }

  const { projectId, diagramId, notes, nodes, edges, viewport } = parsed.data;

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);
  const { supabase, userId } = guard;

  const { data: diagram } = await supabase
    .from("diagrams")
    .select("id, current_version")
    .eq("id", diagramId)
    .maybeSingle();

  if (!diagram) return actionError("Diagram not found.");

  const nextVersion = (diagram.current_version ?? 0) + 1;

  // Normalise to the canonical persisted shape.
  const nodeRows = nodes.map((n) => ({
    id: n.id,
    type: "component",
    position: { x: n.position.x, y: n.position.y },
    data: {
      label: n.data?.label ?? "Component",
      kind: n.data?.kind ?? "service",
      layer: n.data?.layer ?? "application",
      technology: n.data?.technology ?? "",
      description: n.data?.description ?? "",
      responsibility: n.data?.responsibility ?? "",
      criticality: n.data?.criticality ?? "medium",
      replication: n.data?.replication ?? "",
      notes: n.data?.notes ?? "",
    },
  }));

  const nodeIds = new Set(nodeRows.map((n) => n.id));

  const edgeRows = edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "connection",
      data: {
        protocol: e.data?.protocol ?? "HTTPS",
        direction: e.data?.direction ?? "sync",
        description: e.data?.description ?? "",
        auth: e.data?.auth ?? "",
        sla: e.data?.sla ?? "",
        label: e.data?.label ?? "",
      },
    }));

  const { error: versionError } = await supabase.from("diagram_versions").insert({
    diagram_id: diagramId,
    version: nextVersion,
    nodes: nodeRows,
    edges: edgeRows,
    viewport: viewport ?? {},
    notes: notes ?? "",
    created_by: userId,
  });

  if (versionError) {
    // A concurrent save may have taken this version number; retry once.
    const { data: retryDiagram } = await supabase
      .from("diagrams")
      .select("current_version")
      .eq("id", diagramId)
      .single();

    const retryVersion = (retryDiagram?.current_version ?? nextVersion) + 1;

    const { error: retryError } = await supabase.from("diagram_versions").insert({
      diagram_id: diagramId,
      version: retryVersion,
      nodes: nodeRows,
      edges: edgeRows,
      viewport: viewport ?? {},
      notes: notes ?? "",
      created_by: userId,
    });

    if (retryError) return actionError(retryError.message);

    await supabase
      .from("diagrams")
      .update({ current_version: retryVersion })
      .eq("id", diagramId);

    revalidatePath(`/projects/${projectId}/architecture/${diagramId}`);
    return actionSuccess(`Saved as version ${retryVersion}.`);
  }

  const { error: updateError } = await supabase
    .from("diagrams")
    .update({ current_version: nextVersion })
    .eq("id", diagramId);

  if (updateError) return actionError(updateError.message);

  await supabase.rpc("log_activity", {
    target_project: projectId,
    action_name: "diagram.saved",
    entity_type: "diagram",
    entity_id: diagramId,
    meta: { version: nextVersion, nodes: nodeRows.length, edges: edgeRows.length },
  });

  revalidatePath(`/projects/${projectId}/architecture/${diagramId}`);
  return actionSuccess(`Saved as version ${nextVersion}.`);
}

/** Restores an older version by copying it into a new head version. */
export async function restoreVersionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const diagramId = String(formData.get("diagramId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);
  const { supabase, userId } = guard;

  const { data: version } = await supabase
    .from("diagram_versions")
    .select("*")
    .eq("id", versionId)
    .eq("diagram_id", diagramId)
    .maybeSingle();

  if (!version) return actionError("Version not found.");

  const { data: diagram } = await supabase
    .from("diagrams")
    .select("current_version")
    .eq("id", diagramId)
    .single();

  const nextVersion = (diagram?.current_version ?? 0) + 1;

  const { error } = await supabase.from("diagram_versions").insert({
    diagram_id: diagramId,
    version: nextVersion,
    nodes: version.nodes,
    edges: version.edges,
    viewport: version.viewport,
    notes: `Restored from version ${version.version}`,
    created_by: userId,
  });

  if (error) return actionError(error.message);

  await supabase.from("diagrams").update({ current_version: nextVersion }).eq("id", diagramId);

  revalidatePath(`/projects/${projectId}/architecture/${diagramId}`);
  return actionSuccess(`Restored version ${version.version} as version ${nextVersion}.`);
}

export async function deleteVersionAction(formData: FormData): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const diagramId = String(formData.get("diagramId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  // The platform key bypasses RLS, so ownership has to be proven here:
  // the target diagram must belong to the project we just authorised, and
  // the version must belong to that diagram.
  const { data: diagram } = await guard.supabase
    .from("diagrams")
    .select("id")
    .eq("id", diagramId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!diagram) return actionError("Diagram not found in this project.");

  // RLS has no DELETE policy on diagram_versions, so removal goes through the
  // platform-level key. Still gated on editor access plus the checks above.
  const { createAdminClient, isAdminConfigured } = await import("@/lib/supabase/admin");
  if (!isAdminConfigured()) return actionError("Server is missing SUPABASE_SECRET_KEY.");

  const admin = createAdminClient();
  const { data: versions } = await admin
    .from("diagram_versions")
    .select("id, version")
    .eq("diagram_id", diagramId);

  // Keep at least one version so a diagram is never left unrecoverable.
  if ((versions ?? []).length <= 1) {
    return actionError("A diagram must keep at least one version.");
  }

  const { error } = await admin
    .from("diagram_versions")
    .delete()
    .eq("id", versionId)
    .eq("diagram_id", diagramId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/architecture/${diagramId}`);
  return actionSuccess("Version deleted.");
}

/* ------------------------------------------------------------------ */
/*  Import / export                                                    */
/* ------------------------------------------------------------------ */

export async function importDiagramAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const diagramId = String(formData.get("diagramId") ?? "");
  const payload = String(formData.get("payload") ?? "");

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);
  const { supabase, userId } = guard;

  let parsed: { nodes?: unknown[]; edges?: unknown[]; viewport?: Record<string, unknown> };
  try {
    parsed = JSON.parse(payload);
  } catch {
    return actionError("The file is not valid JSON.");
  }

  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    return actionError("Expected an object with `nodes` and `edges` arrays.");
  }

  const { data: diagram } = await supabase
    .from("diagrams")
    .select("current_version")
    .eq("id", diagramId)
    .single();

  const nextVersion = (diagram?.current_version ?? 0) + 1;

  const { error } = await supabase.from("diagram_versions").insert({
    diagram_id: diagramId,
    version: nextVersion,
    nodes: parsed.nodes,
    edges: parsed.edges,
    viewport: parsed.viewport ?? {},
    notes: "Imported from file",
    created_by: userId,
  });

  if (error) return actionError(error.message);

  await supabase.from("diagrams").update({ current_version: nextVersion }).eq("id", diagramId);

  revalidatePath(`/projects/${projectId}/architecture/${diagramId}`);
  return actionSuccess(`Imported as version ${nextVersion}.`);
}

export async function seedStarterDiagramAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = asUuid(String(formData.get("projectId") ?? ""));
  if (!projectId) return actionError("Missing project id.");

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);
  const { supabase, userId } = guard;

  const { data: existing } = await supabase
    .from("diagrams")
    .select("id")
    .eq("project_id", projectId)
    .limit(1);

  if ((existing ?? []).length > 0) {
    return actionError("This project already has a diagram.");
  }

  const nodes = [
    { id: "n1", label: "Web Client", kind: "client_web", layer: "presentation", technology: "React + Vite", x: 40, y: 160, criticality: "medium" },
    { id: "n2", label: "API Gateway", kind: "gateway", layer: "infrastructure", technology: "Cloudflare", x: 300, y: 160, criticality: "high" },
    { id: "n3", label: "Core Service", kind: "service", layer: "application", technology: "Node 22", x: 560, y: 160, criticality: "high" },
    { id: "n4", label: "Event Bus", kind: "queue", layer: "infrastructure", technology: "Amazon SQS", x: 560, y: 340, criticality: "medium" },
    { id: "n5", label: "Worker", kind: "worker", layer: "application", technology: "Node 22", x: 820, y: 340, criticality: "low" },
    { id: "n6", label: "Primary Database", kind: "database", layer: "data", technology: "PostgreSQL 16", x: 820, y: 160, criticality: "high" },
    { id: "n7", label: "Cache", kind: "cache", layer: "data", technology: "Redis", x: 820, y: 20, criticality: "low" },
  ];

  const edges = [
    { id: "e1", source: "n1", target: "n2", protocol: "HTTPS", direction: "sync" },
    { id: "e2", source: "n2", target: "n3", protocol: "HTTPS", direction: "sync" },
    { id: "e3", source: "n3", target: "n6", protocol: "PostgreSQL", direction: "sync" },
    { id: "e4", source: "n3", target: "n7", protocol: "Redis", direction: "sync" },
    { id: "e5", source: "n3", target: "n4", protocol: "SQS", direction: "async" },
    { id: "e6", source: "n4", target: "n5", protocol: "SQS", direction: "async" },
    { id: "e7", source: "n5", target: "n6", protocol: "PostgreSQL", direction: "sync" },
  ];

  const { data: diagram, error: diagramError } = await supabase
    .from("diagrams")
    .insert({
      project_id: projectId,
      name: "Container view",
      kind: "c4_container",
      description: "Starter container diagram. Adjust to match your system.",
      created_by: userId,
      current_version: 1,
    })
    .select("id")
    .single();

  if (diagramError) return actionError(diagramError.message);

  const { error: versionError } = await supabase.from("diagram_versions").insert({
    diagram_id: diagram.id,
    version: 1,
    nodes: nodes.map((n) => ({ id: n.id, type: "component", position: { x: n.x, y: n.y }, data: n })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: "connection", data: e })),
    viewport: {},
    notes: "Starter template",
    created_by: userId,
  });

  if (versionError) return actionError(versionError.message);

  revalidatePath(`/projects/${projectId}/architecture`);
  return actionSuccess(diagram.id);
}
