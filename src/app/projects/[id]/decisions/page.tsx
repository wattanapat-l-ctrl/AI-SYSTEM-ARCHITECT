import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/auth";
import { PageHeader } from "@/components/app-shell";
import { Alert } from "@/components/ui";
import { DecisionLog } from "@/components/adr/decision-log";
import type { Adr } from "@/lib/types";

export const metadata: Metadata = { title: "Decisions — AI System Architect" };

const ADR_COLUMNS =
  "id, project_id, number, title, status, context, decision, consequences, alternatives, tags, created_by, created_at, updated_at";

export default async function DecisionsPage({ params }: PageProps<"/projects/[id]/decisions">) {
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

  const { data, error } = await supabase
    .from("adrs")
    .select(ADR_COLUMNS)
    .eq("project_id", projectId)
    .order("number", { ascending: false });

  if (error) {
    return (
      <Alert tone="danger" title="Could not load decisions">
        {error.message}
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Decisions"
        description="Architecture decision records: the context, the call, and the consequences you accepted."
      />

      <DecisionLog projectId={projectId} adrs={(data ?? []) as Adr[]} canEdit={canEdit} />
    </div>
  );
}
