import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/auth";
import { PageHeader } from "@/components/app-shell";
import { Alert } from "@/components/ui";
import { ApiWorkspace } from "@/components/api/api-workspace";
import type { ApiEndpoint, ApiSpec } from "@/lib/types";

export const metadata: Metadata = { title: "Web API — AI System Architect" };

// Keep these as single-line literals: a concatenated string widens to `string`
// and Supabase can no longer infer the result type.
const SPEC_COLUMNS =
  "id, project_id, name, version, base_url, description, servers, created_at, updated_at";

const ENDPOINT_COLUMNS =
  "id, api_spec_id, group_name, method, path, operation_id, summary, description, auth_type, tags, params, request_body, responses, errors, rate_limit, is_deprecated, sort_order, created_at, updated_at";

export default async function ApiPage({ params }: PageProps<"/projects/[id]/api">) {
  const { id: projectId } = await params;

  const guard = await requireProjectAccess(projectId, "viewer");
  if (!guard.ok) {
    return (
      <Alert tone="danger" title="Access denied">
        {guard.error}
      </Alert>
    );
  }

  const { supabase, project } = guard;
  const role = project.my_role;
  const canEdit = role === "admin" || role === "editor";
  const isAdmin = role === "admin";

  const [specsResult, endpointsResult] = await Promise.all([
    supabase
      .from("api_specs")
      .select(SPEC_COLUMNS)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase
      .from("api_endpoints")
      .select(ENDPOINT_COLUMNS)
      .order("sort_order", { ascending: true }),
  ]);

  if (specsResult.error) {
    return (
      <Alert tone="danger" title="Could not load API specifications">
        {specsResult.error.message}
      </Alert>
    );
  }

  const specs = (specsResult.data ?? []) as ApiSpec[];

  // RLS already limits this to projects the caller can read; narrow to ours.
  const specIds = new Set(specs.map((s) => s.id));
  const endpoints = ((endpointsResult.data ?? []) as ApiEndpoint[]).filter((e) =>
    specIds.has(e.api_spec_id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Web API"
        description="Design operations, keep the contract honest, and export a typed client, cURL commands or a mock server."
      />

      <ApiWorkspace
        projectId={projectId}
        specs={specs}
        endpoints={endpoints}
        canEdit={canEdit}
        isAdmin={isAdmin}
        projectName={project.name}
      />
    </div>
  );
}
