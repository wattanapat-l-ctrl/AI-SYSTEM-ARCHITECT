"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProjectAccess } from "@/lib/auth";
import { actionError, actionSuccess, zodActionError, type ActionState } from "@/lib/utils";
import { parsePostmanCollection } from "@/lib/openapi";
import type { ApiAuthType, HttpMethod } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

const METHOD_VALUES = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
const AUTH_VALUES = ["none", "bearer", "basic", "apikey", "oauth2", "mtls"] as const;

const specSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(2, "Give the API a name.").max(200),
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, "Use semantic versioning, for example 1.0.0.")
    .default("1.0.0"),
  baseUrl: z
    .string()
    .trim()
    .url("Enter a valid base URL, for example https://api.example.com/v1.")
    .max(500),
  description: z.string().trim().max(4000).default(""),
});

const paramSchema = z.object({
  name: z.string().trim().min(1).max(120),
  in: z.enum(["query", "header", "path", "cookie"]),
  required: z.boolean().default(false),
  type: z.string().trim().max(60).default("string"),
  description: z.string().trim().max(500).default(""),
});

const errorSchema = z.object({
  code: z.string().trim().max(120).default(""),
  description: z.string().trim().max(500).default(""),
  httpStatus: z.number().int().min(100).max(599).default(400),
});

const endpointSchema = z.object({
  projectId: z.string().uuid(),
  apiSpecId: z.string().uuid(),
  groupName: z.string().trim().max(120).default("default"),
  method: z.enum(METHOD_VALUES),
  path: z
    .string()
    .trim()
    .min(1, "Enter the request path.")
    .max(500)
    .regex(/^\//, "The path must start with a slash."),
  operationId: z.string().trim().max(200).default(""),
  summary: z.string().trim().max(300).default(""),
  description: z.string().trim().max(4000).default(""),
  authType: z.enum(AUTH_VALUES).default("bearer"),
  tags: z.array(z.string().trim().max(60)).max(20).default([]),
  params: z.array(paramSchema).max(100).default([]),
  requestBody: z.record(z.string(), z.unknown()).nullable().default(null),
  responses: z.record(z.string(), z.unknown()).default({}),
  errors: z.array(errorSchema).max(50).default([]),
  rateLimit: z.string().trim().max(200).default(""),
  isDeprecated: z.boolean().default(false),
});

/** Reads a JSON text field, returning `fallback` when it is absent or invalid. */
function jsonField<T>(form: FormData, key: string, fallback: T): T {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/*  Spec CRUD                                                          */
/* ------------------------------------------------------------------ */

export async function createSpecAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = specSchema.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    version: formData.get("version") || "1.0.0",
    baseUrl: formData.get("baseUrl"),
    description: formData.get("description") ?? "",
  });

  if (!parsed.success) {
    return zodActionError(parsed.error);
  }

  const guard = await requireProjectAccess(parsed.data.projectId, "editor");
  if (!guard.ok) return actionError(guard.error);
  const { supabase } = guard;

  const { data, error } = await supabase
    .from("api_specs")
    .insert({
      project_id: parsed.data.projectId,
      name: parsed.data.name,
      version: parsed.data.version,
      base_url: parsed.data.baseUrl.replace(/\/+$/, ""),
      description: parsed.data.description,
    })
    .select("id")
    .single();

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${parsed.data.projectId}/api`);
  return actionSuccess(data.id);
}

export async function updateSpecAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const apiSpecId = String(formData.get("apiSpecId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");

  const parsed = specSchema.safeParse({
    projectId,
    name: formData.get("name"),
    version: formData.get("version") || "1.0.0",
    baseUrl: formData.get("baseUrl"),
    description: formData.get("description") ?? "",
  });

  if (!parsed.success) {
    return zodActionError(parsed.error);
  }

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  const { error } = await guard.supabase
    .from("api_specs")
    .update({
      name: parsed.data.name,
      version: parsed.data.version,
      base_url: parsed.data.baseUrl.replace(/\/+$/, ""),
      description: parsed.data.description,
    })
    .eq("id", apiSpecId)
    .eq("project_id", projectId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/api`);
  return actionSuccess("API updated.");
}

export async function deleteSpecAction(formData: FormData): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const apiSpecId = String(formData.get("apiSpecId") ?? "");
  if (!projectId || !apiSpecId) return actionError("Missing project or API spec.");

  const guard = await requireProjectAccess(projectId, "admin");
  if (!guard.ok) return actionError(guard.error);

  // Endpoints cascade at the database level.
  const { error } = await guard.supabase
    .from("api_specs")
    .delete()
    .eq("id", apiSpecId)
    .eq("project_id", projectId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/api`);
  return actionSuccess("API spec deleted.");
}

/* ------------------------------------------------------------------ */
/*  Endpoint CRUD                                                      */
/* ------------------------------------------------------------------ */

export async function createEndpointAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = endpointSchema.safeParse({
    projectId: formData.get("projectId"),
    apiSpecId: formData.get("apiSpecId"),
    groupName: formData.get("groupName") || "default",
    method: formData.get("method") || "get",
    path: formData.get("path"),
    operationId: formData.get("operationId") ?? "",
    summary: formData.get("summary") ?? "",
    description: formData.get("description") ?? "",
    authType: formData.get("authType") || "bearer",
    tags: jsonField<string[]>(formData, "tags", []),
    params: jsonField(formData, "params", []),
    requestBody: jsonField<Record<string, unknown> | null>(formData, "requestBody", null),
    responses: jsonField<Record<string, unknown>>(formData, "responses", {}),
    errors: jsonField(formData, "errors", []),
    rateLimit: formData.get("rateLimit") ?? "",
    isDeprecated: formData.get("isDeprecated") === "true",
  });

  if (!parsed.success) {
    return zodActionError(parsed.error);
  }

  const guard = await requireProjectAccess(parsed.data.projectId, "editor");
  if (!guard.ok) return actionError(guard.error);
  const { supabase } = guard;

  const d = parsed.data;

  // Keep sort_order dense so reordering never produces gaps.
  const { count } = await supabase
    .from("api_endpoints")
    .select("id", { count: "exact", head: true })
    .eq("api_spec_id", d.apiSpecId);

  const { data, error } = await supabase
    .from("api_endpoints")
    .insert({
      api_spec_id: d.apiSpecId,
      group_name: d.groupName,
      method: d.method as HttpMethod,
      path: d.path,
      operation_id: d.operationId,
      summary: d.summary,
      description: d.description,
      auth_type: d.authType as ApiAuthType,
      tags: d.tags,
      params: d.params,
      request_body: d.requestBody,
      responses: d.responses,
      errors: d.errors,
      rate_limit: d.rateLimit || null,
      is_deprecated: d.isDeprecated,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${d.projectId}/api`);
  return actionSuccess(data.id);
}

export async function updateEndpointAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const endpointId = String(formData.get("endpointId") ?? "");

  const parsed = endpointSchema.safeParse({
    projectId: formData.get("projectId"),
    apiSpecId: formData.get("apiSpecId"),
    groupName: formData.get("groupName") || "default",
    method: formData.get("method") || "get",
    path: formData.get("path"),
    operationId: formData.get("operationId") ?? "",
    summary: formData.get("summary") ?? "",
    description: formData.get("description") ?? "",
    authType: formData.get("authType") || "bearer",
    tags: jsonField<string[]>(formData, "tags", []),
    params: jsonField(formData, "params", []),
    requestBody: jsonField<Record<string, unknown> | null>(formData, "requestBody", null),
    responses: jsonField<Record<string, unknown>>(formData, "responses", {}),
    errors: jsonField(formData, "errors", []),
    rateLimit: formData.get("rateLimit") ?? "",
    isDeprecated: formData.get("isDeprecated") === "true",
  });

  if (!parsed.success) {
    return zodActionError(parsed.error);
  }

  const guard = await requireProjectAccess(parsed.data.projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  const d = parsed.data;
  const { error } = await guard.supabase
    .from("api_endpoints")
    .update({
      group_name: d.groupName,
      method: d.method as HttpMethod,
      path: d.path,
      operation_id: d.operationId,
      summary: d.summary,
      description: d.description,
      auth_type: d.authType as ApiAuthType,
      tags: d.tags,
      params: d.params,
      request_body: d.requestBody,
      responses: d.responses,
      errors: d.errors,
      rate_limit: d.rateLimit || null,
      is_deprecated: d.isDeprecated,
    })
    .eq("id", endpointId)
    .eq("api_spec_id", d.apiSpecId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${d.projectId}/api`);
  return actionSuccess("Endpoint updated.");
}

export async function deleteEndpointAction(formData: FormData): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const apiSpecId = String(formData.get("apiSpecId") ?? "");
  const endpointId = String(formData.get("endpointId") ?? "");
  if (!projectId || !apiSpecId || !endpointId) {
    return actionError("Missing project, API spec or endpoint.");
  }

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  const { error } = await guard.supabase
    .from("api_endpoints")
    .delete()
    .eq("id", endpointId)
    .eq("api_spec_id", apiSpecId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/api`);
  return actionSuccess("Endpoint deleted.");
}

/* ------------------------------------------------------------------ */
/*  Postman import                                                     */
/* ------------------------------------------------------------------ */

export async function importPostmanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const apiSpecId = String(formData.get("apiSpecId") ?? "");
  const raw = String(formData.get("payload") ?? "");

  const guard = await requireProjectAccess(projectId, "editor");
  if (!guard.ok) return actionError(guard.error);

  if (raw.trim().length === 0) return actionError("Paste a Postman collection first.");
  if (raw.length > 2_000_000) return actionError("That collection is too large to import.");

  let imported;
  try {
    imported = parsePostmanCollection(raw);
  } catch {
    return actionError("Could not parse that file. Is it a Postman v2.1 collection?");
  }

  if (imported.length === 0) {
    return actionError("No requests found in that collection.");
  }

  const { supabase } = guard;

  const { count } = await supabase
    .from("api_endpoints")
    .select("id", { count: "exact", head: true })
    .eq("api_spec_id", apiSpecId);

  let order = count ?? 0;

  const rows = imported.map((e) => ({
    api_spec_id: apiSpecId,
    group_name: e.group_name || "imported",
    method: e.method as HttpMethod,
    path: e.path,
    operation_id: "",
    summary: e.summary,
    description: e.description,
    auth_type: "bearer" as ApiAuthType,
    tags: e.tags,
    params: e.params,
    request_body: e.request_body,
    responses: e.responses,
    errors: [] as unknown[],
    rate_limit: null,
    is_deprecated: false,
    sort_order: order++,
  }));

  const { error } = await supabase.from("api_endpoints").insert(rows);
  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/api`);
  return actionSuccess(`Imported ${rows.length} endpoint${rows.length === 1 ? "" : "s"}.`);
}
