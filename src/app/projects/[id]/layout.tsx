import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getProject, requireUser } from "@/lib/auth";
import { asUuid } from "@/lib/utils";

export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  const projectId = asUuid(id);
  if (!projectId) notFound();

  const { profile } = await requireUser();
  const { project } = await getProject(projectId, "viewer");

  return (
    <AppShell
      profile={profile}
      project={{ id: project.id, name: project.name, slug: project.slug, status: project.status }}
    >
      {children}
    </AppShell>
  );
}
