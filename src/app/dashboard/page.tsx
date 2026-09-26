import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CreateProjectButton } from "@/components/project-actions";
import { Badge, Card, EmptyState, Stat } from "@/components/ui";
import { listProjects, requireUser } from "@/lib/auth";
import { PROJECT_STATUS_MAP } from "@/lib/constants";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const projects = await listProjects();

  return (
    <AppShell profile={profile}>
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome back, {profile.full_name?.split(" ")[0] ?? "there"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {projects.length === 0
                ? "Create your first project to start designing."
                : `You have ${projects.length} project${projects.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <CreateProjectButton />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Projects" value={projects.length} icon={"\u{1F4E6}"} />
          <Stat
            label="In review"
            value={projects.filter((p) => p.status === "review").length}
            icon={"\u{1F50E}"}
            tone="warning"
          />
          <Stat
            label="Approved"
            value={projects.filter((p) => p.status === "approved").length}
            icon={"\u2713"}
            tone="success"
          />
        </div>

        <div className="mt-8">
          {projects.length === 0 ? (
            <EmptyState
              icon={"\u{1F3D7}"}
              title="No projects yet"
              description="A project holds your system diagrams, API contract, cost model, decision records and generated documentation."
              action={<CreateProjectButton />}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="group rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-sm font-semibold leading-snug group-hover:text-primary">
                      {project.name}
                    </h2>
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
                  </div>

                  <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
                    {project.description || project.context?.goal || "No description yet."}
                  </p>

                  <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-medium">
                      {project.my_role ?? "viewer"}
                    </span>
                    <span>updated {relativeTime(project.updated_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <Card className="mt-10 p-5">
          <h2 className="text-sm font-semibold">Suggested first steps</h2>
          <ol className="mt-3 space-y-2.5 text-xs text-muted-foreground">
            <li className="flex gap-3">
              <span className="font-mono text-primary">01</span>
              <span>
                Open a project and fill in the goal, scope and constraints on the overview page.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary">02</span>
              <span>
                Build your component diagram in <strong className="text-foreground">Architecture</strong>
                {" \u2014 "}drag from the palette, then connect the handles.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary">03</span>
              <span>
                Define your REST endpoints in{" "}
                <strong className="text-foreground">Web API</strong>, then export the OpenAPI spec.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary">04</span>
              <span>
                Run the <strong className="text-foreground">AI Review</strong> to catch design
                problems before you build.
              </span>
            </li>
          </ol>
        </Card>
      </div>
    </AppShell>
  );
}
