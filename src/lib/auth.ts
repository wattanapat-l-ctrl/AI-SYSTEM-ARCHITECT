import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { AppRole, Profile, ProjectSummary } from "./types";
import { ROLE_RANK } from "./constants";

/* ------------------------------------------------------------------ */
/*  Session                                                           */
/* ------------------------------------------------------------------ */

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Returns the signed-in profile, or redirects to /login. */
export async function requireUser(): Promise<{ id: string; profile: Profile }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // The signup trigger normally creates this row. If it is missing the
    // account was created before the schema was applied.
    redirect("/login?error=missing_profile");
  }

  return { id: user.id, profile: profile as Profile };
}

/* ------------------------------------------------------------------ */
/*  Projects + authorization                                          */
/* ------------------------------------------------------------------ */

/** All projects the current user can see, newest activity first. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_projects");
  if (error) throw new Error(`listProjects: ${error.message}`);
  return (data ?? []) as ProjectSummary[];
}

/**
 * Loads a single project and asserts the caller may view it.
 * Pass `minRole` to require write access.
 */
export async function getProject(
  projectId: string,
  minRole: AppRole = "viewer",
): Promise<{ project: ProjectSummary; role: AppRole; supabase: Awaited<ReturnType<typeof createClient>> }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("my_projects");
  if (error) throw new Error(`getProject: ${error.message}`);

  const project = ((data ?? []) as ProjectSummary[]).find((p) => p.id === projectId);
  if (!project) redirect("/dashboard");

  const role = project.my_role ?? "viewer";
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) redirect(`/projects/${projectId}`);

  return { project, role, supabase };
}

/** Resolves the effective role for a project, or null when the user cannot see it. */
export async function resolveProjectRole(
  projectId: string,
  userId: string,
): Promise<AppRole | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  return (data?.role as AppRole) ?? null;
}

/** Server-action guard. Returns a typed result instead of throwing. */
export type GuardResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string; project: ProjectSummary }
  | { ok: false; error: string; status: number };

export async function requireProjectAccess(
  projectId: string,
  minRole: AppRole = "editor",
): Promise<GuardResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in.", status: 401 };

  const { data, error } = await supabase.rpc("my_projects");
  if (error) return { ok: false, error: error.message, status: 500 };

  const project = ((data ?? []) as ProjectSummary[]).find((p) => p.id === projectId);
  if (!project) return { ok: false, error: "Project not found.", status: 404 };

  const role = (project.my_role ?? "viewer") as AppRole;
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    return {
      ok: false,
      error: `This action requires ${minRole} access. You are a ${role}.`,
      status: 403,
    };
  }

  return { ok: true, supabase, userId: user.id, project };
}
