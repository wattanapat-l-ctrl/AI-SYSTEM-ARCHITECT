import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/auth";

import { PageHeader } from "@/components/app-shell";
import { Alert, Card } from "@/components/ui";
import { DiagramList, SeedStarterButton } from "@/components/diagram/diagram-list";
import { DIAGRAM_KINDS } from "@/lib/constants";
import type { Diagram } from "@/lib/types";

export const metadata: Metadata = { title: "Architecture โ€” AI System Architect" };

export default async function ArchitecturePage({
  params,
}: PageProps<"/projects/[id]/architecture">) {
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
    .from("diagrams")
    .select("id, project_id, name, kind, description, current_version, created_by, created_at, updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <Alert tone="danger" title="Could not load diagrams">
        {error.message}
      </Alert>
    );
  }

  const diagrams = (data ?? []) as Diagram[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Architecture"
        description="Model components, layers and communication paths, then keep a versioned history of every change."
        actions={
          <a
            href={`/projects/${projectId}/docs`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Documentation โ’
          </a>
        }
      />

      {diagrams.length === 0 && canEdit ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Start from the web-architecture template</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Seven components and seven connections you can rename, rewire or replace.
            </p>
          </div>
          <SeedStarterButton projectId={projectId} />
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DIAGRAM_KINDS.map((kind) => (
          <div key={kind.id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2.5">
            <span className="text-base leading-none">{kind.icon}</span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium">{kind.label}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                {kind.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <DiagramList projectId={projectId} diagrams={diagrams} canEdit={canEdit} />
    </div>
  );
}
