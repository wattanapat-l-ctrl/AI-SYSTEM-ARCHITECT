import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Alert } from "@/components/ui";
import { DocumentationWorkspace } from "@/components/docs/documentation-workspace";
import { getProject } from "@/lib/auth";
import { asUuid } from "@/lib/utils";
import { computeCostBreakdown, costInsights } from "@/lib/cost";
import {
  generateAdrDoc,
  generateApiDoc,
  generateArchitectureDoc,
  generateCostDoc,
} from "@/lib/docs";
import type {
  Adr,
  AiReview,
  ApiEndpoint,
  ApiSpec,
  Diagram,
  DiagramVersion,
  DocumentRow,
  ProjectSummary,
  ServiceCatalogItem,
  ServiceSelection,
} from "@/lib/types";

export const metadata: Metadata = { title: "Documentation — AI System Architect" };

const DIAGRAM_COLUMNS = "id, project_id, name, kind, description, current_version, created_by, created_at, updated_at";
const VERSION_COLUMNS = "id, diagram_id, version, nodes, edges, viewport, notes, created_by, created_at";
const SPEC_COLUMNS = "id, project_id, name, version, base_url, description, servers, created_at, updated_at";
const ENDPOINT_COLUMNS =
  "id, api_spec_id, group_name, method, path, operation_id, summary, description, auth_type, tags, params, request_body, responses, errors, rate_limit, is_deprecated, sort_order, created_at, updated_at";
const ADR_COLUMNS =
  "id, project_id, number, title, status, context, decision, consequences, alternatives, tags, created_by, created_at, updated_at";
const SELECTION_COLUMNS = "id, project_id, service_id, quantity, notes, config, created_at, updated_at";
const CATALOG_COLUMNS =
  "id, key, name, vendor, category, unit, unit_price_usd, pricing_note, description, tags, is_active, created_at, updated_at";
const REVIEW_COLUMNS =
  "id, project_id, diagram_id, engine, model, score, summary, findings, created_by, created_at";
const DOCUMENT_COLUMNS =
  "id, project_id, title, kind, content_markdown, created_by, created_at, updated_at";

export default async function DocsPage({ params }: PageProps<"/projects/[id]/docs">) {
  const { id } = await params;
  const projectId = asUuid(id);
  if (!projectId) notFound();

  const { project, role, supabase } = await getProject(projectId, "viewer");
  const canEdit = role === "admin" || role === "editor";

  const [diagramsRes, versionsRes, specsRes, endpointsRes, adrsRes, selectionsRes, catalogRes, reviewsRes, documentsRes] =
    await Promise.all([
      supabase
        .from("diagrams")
        .select(DIAGRAM_COLUMNS)
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false }),
      // Only the newest version of each diagram is needed for the documents.
      supabase
        .from("diagram_versions")
        .select(VERSION_COLUMNS)
        .order("version", { ascending: false }),
      supabase.from("api_specs").select(SPEC_COLUMNS).eq("project_id", projectId),
      supabase.from("api_endpoints").select(ENDPOINT_COLUMNS).order("sort_order", { ascending: true }),
      supabase
        .from("adrs")
        .select(ADR_COLUMNS)
        .eq("project_id", projectId)
        .order("number", { ascending: false }),
      supabase.from("service_selections").select(SELECTION_COLUMNS).eq("project_id", projectId),
      supabase.from("service_catalog").select(CATALOG_COLUMNS),
      supabase
        .from("ai_reviews")
        .select(REVIEW_COLUMNS)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("documents")
        .select(DOCUMENT_COLUMNS)
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false }),
    ]);

  const firstError = [
    diagramsRes.error,
    versionsRes.error,
    specsRes.error,
    endpointsRes.error,
    adrsRes.error,
    selectionsRes.error,
    catalogRes.error,
    reviewsRes.error,
    documentsRes.error,
  ].find(Boolean);

  if (firstError) {
    return (
      <Alert tone="danger" title="Could not load project data">
        {firstError.message}
      </Alert>
    );
  }

  const diagrams = (diagramsRes.data ?? []) as Diagram[];
  const specs = (specsRes.data ?? []) as ApiSpec[];
  const adrs = (adrsRes.data ?? []) as Adr[];
  const selections = (selectionsRes.data ?? []) as ServiceSelection[];
  const catalog = (catalogRes.data ?? []) as ServiceCatalogItem[];
  const latestReview = ((reviewsRes.data?.[0] ?? null) as AiReview | null) ?? null;

  // RLS already scopes these to readable projects; keep only our own rows.
  const diagramIds = new Set(diagrams.map((d) => d.id));
  const headVersions: Record<string, DiagramVersion | null> = {};
  for (const row of (versionsRes.data ?? []) as DiagramVersion[]) {
    if (!diagramIds.has(row.diagram_id)) continue;
    // The query is ordered by version desc, so the first hit is the head.
    if (!(row.diagram_id in headVersions)) headVersions[row.diagram_id] = row;
  }
  for (const diagram of diagrams) {
    if (!(diagram.id in headVersions)) headVersions[diagram.id] = null;
  }

  const specIds = new Set(specs.map((s) => s.id));
  const endpoints = ((endpointsRes.data ?? []) as ApiEndpoint[]).filter((e) =>
    specIds.has(e.api_spec_id),
  );

  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const cost = computeCostBreakdown(selections, catalogById);

  const summary = project as ProjectSummary;

  // Everything below is derived on the server so the client only renders and
  // exports markdown.
  const generated = {
    architecture: generateArchitectureDoc({
      project: summary,
      diagrams,
      versions: headVersions,
      adrs,
      selections,
      catalogById,
      cost,
      latestReview,
    }),
    adr: generateAdrDoc(summary, adrs),
    cost: generateCostDoc(summary, cost, costInsights(cost)),
    api: specs.map((spec) => ({
      id: spec.id,
      name: spec.name,
      markdown: generateApiDoc(
        spec,
        endpoints.filter((e) => e.api_spec_id === spec.id),
      ),
    })),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentation"
        description="Generate living documentation from the diagrams, API contract, decisions and cost model in this project."
      />

      <DocumentationWorkspace
        projectId={projectId}
        documents={(documentsRes.data ?? []) as DocumentRow[]}
        canEdit={canEdit}
        generated={generated}
      />
    </div>
  );
}
