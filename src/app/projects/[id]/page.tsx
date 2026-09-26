import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { ContextCard } from "@/components/project-settings-form";
import { ProjectStatusSelect, DuplicateProjectButton } from "@/components/project-actions";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Stat } from "@/components/ui";
import { getProject } from "@/lib/auth";

import { asUuid, formatDateTime, relativeTime } from "@/lib/utils";
import { DIAGRAM_KIND_MAP, PROJECT_STATUSES, PROJECT_STATUS_MAP } from "@/lib/constants";
import { computeCostBreakdown } from "@/lib/cost";
import type { Adr, Diagram, ServiceCatalogItem, ServiceSelection } from "@/lib/types";

export default async function ProjectOverviewPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const projectId = asUuid(id);
  if (!projectId) notFound();

  const { project, role, supabase } = await getProject(projectId, "viewer");

  const [diagramsRes, adrsRes, selectionsRes, catalogRes, activityRes, endpointsRes, reviewsRes] =
    await Promise.all([
      supabase.from("diagrams").select("*").eq("project_id", projectId).order("updated_at", { ascending: false }),
      supabase.from("adrs").select("*").eq("project_id", projectId).order("number", { ascending: false }),
      supabase.from("service_selections").select("*").eq("project_id", projectId),
      supabase.from("service_catalog").select("*"),
      supabase
        .from("activity_logs")
        .select("*, actor:profiles(id, full_name, email, avatar_url)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.from("api_specs").select("id"),
      supabase
        .from("ai_reviews")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  const diagrams = (diagramsRes.data ?? []) as Diagram[];
  const adrs = (adrsRes.data ?? []) as Adr[];
  const selections = (selectionsRes.data ?? []) as ServiceSelection[];
  const catalog = (catalogRes.data ?? []) as ServiceCatalogItem[];
  const activity = activityRes.data ?? [];
  const specIds = (endpointsRes.data ?? []).map((s) => s.id);

  let endpointCount = 0;
  if (specIds.length > 0) {
    const { count } = await supabase
      .from("api_endpoints")
      .select("id", { count: "exact", head: true })
      .in("api_spec_id", specIds);
    endpointCount = count ?? 0;
  }

  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const cost = computeCostBreakdown(selections, catalogById);
  const latestReview = reviewsRes.data?.[0] ?? null;

  const navCards = [
    { href: "architecture", icon: "\u{1F5A5}", label: "Architecture", value: `${diagrams.length} diagram${diagrams.length === 1 ? "" : "s"}`, desc: "Component canvas with version history" },
    { href: "api", icon: "\u{1F517}", label: "Web API", value: `${endpointCount} endpoint${endpointCount === 1 ? "" : "s"}`, desc: "REST contract and OpenAPI export" },
    { href: "stack", icon: "\u{1F4B0}", label: "Tech Stack & Cost", value: `${selections.length} service${selections.length === 1 ? "" : "s"}`, desc: "Catalogue, selections and run rate" },
    { href: "decisions", icon: "\u{1F4DD}", label: "Decisions", value: `${adrs.length} ADR${adrs.length === 1 ? "" : "s"}`, desc: "Recorded architecture decisions" },
    { href: "review", icon: "\u{1F916}", label: "AI Review", value: latestReview ? `${latestReview.score}/100` : "Not run", desc: "Design review findings and score" },
    { href: "docs", icon: "\u{1F4E6}", label: "Documentation", value: "Generate", desc: "Markdown and PDF export" },
  ];

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.description || "No description yet. Add one in Settings."}
        actions={
          <>
            <ProjectStatusSelect
              project={{ id: project.id, status: project.status }}
              options={PROJECT_STATUSES}
            />
            {role !== "viewer" ? <DuplicateProjectButton project={{ id: project.id, name: project.name }} /> : null}
            <Link
              href={`/projects/${project.id}/settings`}
              className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-secondary"
            >
              Settings
            </Link>
          </>
        }
      />

      <div className="mx-auto max-w-6xl space-y-6 px-5 py-6 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Diagrams" value={diagrams.length} icon={"\u{1F5A5}"} />
          <Stat label="API endpoints" value={endpointCount} icon={"\u{1F517}"} />
          <Stat label="Decisions" value={adrs.length} icon={"\u{1F4DD}"} />
          <Stat
            label="Est. monthly"
            value={`$${cost.monthlyTotal.toFixed(0)}`}
            icon={"\u{1F4B0}"}
            tone={cost.monthlyTotal > 0 ? "warning" : undefined}
            hint={cost.monthlyTotal > 0 ? `$${Math.round(cost.annualTotal)}/year` : "no services selected"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Modules</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {navCards.map((c) => (
                  <Link
                    key={c.href}
                    href={`/projects/${project.id}/${c.href}`}
                    className="group rounded-lg border border-border p-3.5 transition-colors hover:border-primary/50 hover:bg-secondary/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{c.icon}</span>
                      <span className="text-sm font-medium group-hover:text-primary">{c.label}</span>
                    </div>
                    <div className="mt-1.5 text-lg font-semibold tabular-nums">{c.value}</div>
                    <div className="text-[11px] text-muted-foreground">{c.desc}</div>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Diagrams</CardTitle>
                  <Link
                    href={`/projects/${project.id}/architecture`}
                    className="text-xs text-primary hover:underline"
                  >
                    Open designer
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {diagrams.length === 0 ? (
                  <EmptyState
                    icon={"\u{1F5A5}"}
                    title="No diagrams yet"
                    description="Create your first container or context diagram to start modelling the system."
                  />
                ) : (
                  <div className="space-y-2">
                    {diagrams.map((d) => (
                      <Link
                        key={d.id}
                        href={`/projects/${project.id}/architecture/${d.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3.5 py-2.5 transition-colors hover:border-primary/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {DIAGRAM_KIND_MAP[d.kind] ?? d.kind}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Badge tone="muted">v{d.current_version}</Badge>
                          <span>{relativeTime(d.updated_at)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <ContextCard project={project} />

            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
              </CardHeader>
              <CardContent>
                {activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
                ) : (
                  <ol className="space-y-3">
                    {activity.map((entry) => {
                      const actor = (entry as { actor?: { full_name: string | null; email: string } }).actor;
                      return (
                        <li key={entry.id} className="flex gap-2.5">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                          <div className="min-w-0">
                            <p className="text-xs">
                              <span className="font-medium">
                                {actor?.full_name ?? actor?.email ?? "Someone"}
                              </span>{" "}
                              {entry.action}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatDateTime(entry.created_at)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>

            <Card className="p-4">
              <p className="text-xs text-muted-foreground">
                Status:{" "}
                <Badge
                  tone={
                    project.status === "approved"
                      ? "success"
                      : project.status === "review"
                        ? "warning"
                        : "muted"
                  }
                >
                  {PROJECT_STATUS_MAP[project.status]}
                </Badge>
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Created {formatDateTime(project.created_at)} {"\u00b7"} Your role:{" "}
                <span className="font-medium text-foreground">{role}</span>
              </p>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
