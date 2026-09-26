import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProjectAccess } from "@/lib/auth";
import { Alert } from "@/components/ui";
import { DiagramEditor } from "@/components/diagram/diagram-editor";
import type { Diagram, DiagramVersion } from "@/lib/types";

export const metadata: Metadata = { title: "Diagram editor — AI System Architect" };

export default async function DiagramEditorPage({
  params,
}: PageProps<"/projects/[id]/architecture/[diagramId]">) {
  const { id: projectId, diagramId } = await params;

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

  const { data: diagramRow, error } = await supabase
    .from("diagrams")
    .select("id, project_id, name, kind, description, current_version, created_by, created_at, updated_at")
    .eq("id", diagramId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    return (
      <Alert tone="danger" title="Could not load the diagram">
        {error.message}
      </Alert>
    );
  }

  if (!diagramRow) notFound();

  const diagram = diagramRow as Diagram;

  // The canvas always opens on the newest saved version.
  const { data: headRow } = await supabase
    .from("diagram_versions")
    .select("id, diagram_id, version, nodes, edges, viewport, notes, created_by, created_at")
    .eq("diagram_id", diagramId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const headVersion = (headRow ?? null) as DiagramVersion | null;

  return (
    <DiagramEditor
      projectId={projectId}
      diagram={diagram}
      headVersion={headVersion}
      readOnly={!canEdit}
    />
  );
}
