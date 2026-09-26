import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { ProjectSettingsForm } from "@/components/project-settings-form";
import { InviteMemberForm } from "@/components/invite-member-form";
import { DeleteProjectButton, ProjectStatusSelect } from "@/components/project-actions";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Stat,
} from "@/components/ui";
import { getProject } from "@/lib/auth";
import { asUuid, formatDate } from "@/lib/utils";
import { PROJECT_STATUSES, ROLES } from "@/lib/constants";
import {
  removeMemberAction,
  updateMemberRoleAction,
  setProjectStatusAction,
} from "@/app/actions/auth";
import type { Profile, ProjectMember } from "@/lib/types";

export default async function ProjectSettingsPage({ params }: PageProps<"/projects/[id]/settings">) {
  const { id } = await params;
  const projectId = asUuid(id);
  if (!projectId) notFound();

  const { project, role, supabase } = await getProject(projectId, "viewer");

  const { data } = await supabase
    .from("project_members")
    .select("*, profile:profiles(id, full_name, email, avatar_url, role, job_title)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const members = (data ?? []) as unknown as ProjectMember[];
  const isAdmin = role === "admin";

  return (
    <>
      <PageHeader
        title="Project settings"
        description="Context, workflow status and team access."
        breadcrumb={
          <Link2Back id={project.id} name={project.name} />
        }
      />

      <div className="mx-auto max-w-4xl space-y-5 px-5 py-6 sm:px-8">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>General</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  The context here feeds the generated documentation and design review.
                </p>
              </div>
              {role !== "viewer" ? (
                <ProjectStatusSelect
                  project={{ id: project.id, status: project.status }}
                  options={PROJECT_STATUSES}
                />
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {role === "viewer" ? (
              <Alert tone="info">
                You have read-only access. Ask a project admin to make changes.
              </Alert>
            ) : (
              <ProjectSettingsForm project={project} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Workflow status</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Move the design through draft, review and approval.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {PROJECT_STATUSES.map((s) => {
                const active = project.status === s.id;
                return (
                  <form key={s.id} action={setProjectStatusAction}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="status" value={s.id} />
                    <Button
                      type="submit"
                      size="sm"
                      variant={active ? "primary" : "outline"}
                      disabled={active || role === "viewer"}
                    >
                      {s.label}
                    </Button>
                  </form>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team access</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isAdmin
                ? "Invite teammates by the email address they registered with."
                : "Only project admins can change roles."}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {members.length === 0 ? (
              <EmptyState
                icon={"\u{1F465}"}
                title="No members"
                description="The project owner is added automatically when the project is created."
              />
            ) : (
              <div className="space-y-2">
                {members.map((m) => {
                  const profile = m.profile as Profile | null;
                  return (
                    <div
                      key={m.user_id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3.5 py-2.5"
                    >
                      <Avatar name={profile?.full_name} email={profile?.email} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {profile?.full_name ?? "Unnamed user"}
                          {m.user_id === project.owner_id ? (
                            <Badge tone="primary" className="ml-2">
                              owner
                            </Badge>
                          ) : null}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {profile?.email ?? m.user_id}
                        </p>
                      </div>

                      {isAdmin ? (
                        <>
                          <form action={updateMemberRoleAction} className="flex items-center gap-2">
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="userId" value={m.user_id} />
                            <select
                              name="role"
                              defaultValue={m.role}
                              className="h-8 rounded-md border border-input bg-card px-2 text-xs focus:border-primary focus:outline-none"
                            >
                              {ROLES.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            <Button type="submit" size="sm" variant="secondary">
                              Update
                            </Button>
                          </form>
                          <form action={removeMemberAction}>
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="userId" value={m.user_id} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              disabled={m.user_id === project.owner_id}
                              title={m.user_id === project.owner_id ? "The owner cannot be removed" : "Remove"}
                            >
                              Remove
                            </Button>
                          </form>
                        </>
                      ) : (
                        <Badge tone="muted">{m.role}</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {isAdmin ? (
              <div className="border-t border-border pt-4">
                <InviteMemberForm projectId={project.id} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Project ID" value={<span className="font-mono text-xs">{project.id}</span>} />
              <Stat label="Created" value={formatDate(project.created_at)} />
            </div>
            <Alert tone="danger" title="Deleting is permanent">
              All diagrams, versions, API specs, endpoints, decisions, cost selections, reviews and
              documents for this project will be removed. This cannot be undone.
            </Alert>
            <DeleteProjectButton
              project={{ id: project.id, name: project.name }}
              variant="danger"
              size="md"
              label="Delete project"
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Link2Back({ id, name }: { id: string; name: string }) {
  return (
    <a href={`/projects/${id}`} className="text-xs text-muted-foreground hover:text-foreground">
      &larr; {name}
    </a>
  );
}
