import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/auth";
import { PageHeader } from "@/components/app-shell";
import { Alert } from "@/components/ui";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import type { AiReview, Diagram } from "@/lib/types";

export const metadata: Metadata = { title: "AI Review — AI System Architect" };

const DIAGRAM_COLUMNS = "id, project_id, name, kind, description, current_version, created_by, created_at, updated_at";
const REVIEW_COLUMNS =
  "id, project_id, diagram_id, engine, model, score, summary, findings, created_by, created_at";

export default async function ReviewPage({ params }: PageProps<"/projects/[id]/review">) {
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

  const [diagramsResult, reviewsResult] = await Promise.all([
    supabase
      .from("diagrams")
      .select(DIAGRAM_COLUMNS)
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("ai_reviews")
      .select(REVIEW_COLUMNS)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  ]);

  if (reviewsResult.error) {
    return (
      <Alert tone="danger" title="Could not load reviews">
        {reviewsResult.error.message}
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Review"
        description="A scored design review covering scalability, reliability, security, data modelling and operability."
      />

      <ReviewWorkspace
        projectId={projectId}
        diagrams={(diagramsResult.data ?? []) as Diagram[]}
        reviews={(reviewsResult.data ?? []) as AiReview[]}
        canEdit={canEdit}
        llmConfigured={Boolean(process.env.OPENAI_API_KEY)}
      />
    </div>
  );
}
