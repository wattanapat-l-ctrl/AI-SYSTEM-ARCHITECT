import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/auth";
import { PageHeader } from "@/components/app-shell";
import { Alert } from "@/components/ui";
import { StackPlanner } from "@/components/stack/stack-planner";
import type { ServiceCatalogItem, ServiceSelection } from "@/lib/types";

export const metadata: Metadata = { title: "Tech Stack & Cost — AI System Architect" };

// Single-line literals: concatenating widens the type to `string` and Supabase
// can no longer infer the result type.
const SELECTION_COLUMNS =
  "id, project_id, service_id, quantity, notes, config, created_at, updated_at";

export default async function StackPage({ params }: PageProps<"/projects/[id]/stack">) {
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

  const [catalogResult, selectionsResult] = await Promise.all([
    supabase
      .from("service_catalog")
      .select(
        "id, key, name, vendor, category, unit, unit_price_usd, pricing_note, description, tags, is_active, created_at, updated_at",
      )
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("service_selections")
      .select(SELECTION_COLUMNS)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
  ]);

  if (catalogResult.error) {
    return (
      <Alert tone="danger" title="Could not load the service catalog">
        {catalogResult.error.message}
      </Alert>
    );
  }
  if (selectionsResult.error) {
    return (
      <Alert tone="danger" title="Could not load your selections">
        {selectionsResult.error.message}
      </Alert>
    );
  }

  const catalog = (catalogResult.data ?? []) as ServiceCatalogItem[];
  const selections = (selectionsResult.data ?? []) as ServiceSelection[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tech Stack & Cost"
        description="Choose the managed services this project depends on and get a transparent monthly and annual estimate."
      />

      <StackPlanner
        projectId={projectId}
        catalog={catalog}
        selections={selections}
        canEdit={canEdit}
      />
    </div>
  );
}
