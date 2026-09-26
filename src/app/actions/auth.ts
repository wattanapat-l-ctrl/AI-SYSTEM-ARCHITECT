"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { actionError, actionSuccess, uniqueSlug, type ActionState } from "@/lib/utils";
import { requireUser } from "@/lib/auth";
import type { AppRole, ProjectContext } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Auth                                                              */
/* ------------------------------------------------------------------ */

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters.");
const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2, "Enter your name.").max(80),
});

function firstFieldError(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, "Enter your password.") })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

  if (!parsed.success) {
    return actionError("Check the form and try again.", firstFieldError(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    const message = /invalid login/i.test(error.message)
      ? "Incorrect email or password."
      : error.message;
    return actionError(message);
  }

  redirect("/dashboard");
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });

  if (!parsed.success) {
    return actionError("Check the form and try again.", firstFieldError(parsed.error));
  }

  const { email, password, fullName } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
      data: { full_name: fullName },
    },
  });

  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      return actionError("An account with that email already exists. Try signing in instead.");
    }
    return actionError(error.message);
  }

  // With email confirmation disabled Supabase returns a session immediately.
  if (data.session) {
    redirect("/dashboard");
  }

  return actionSuccess("Check your inbox to confirm your email address, then sign in.");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({ email: emailSchema }).safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return actionError("Enter a valid email address.", firstFieldError(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/reset-password`,
  });

  if (error) return actionError(error.message);

  // Always report success so the form cannot be used to enumerate accounts.
  return actionSuccess("If an account exists for that address, a reset link is on its way.");
}

export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      password: passwordSchema,
      confirm: z.string(),
    })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });

  if (!parsed.success) {
    return actionError("Check the form and try again.", firstFieldError(parsed.error));
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return actionError("Passwords do not match.", { confirm: "Passwords do not match." });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return actionError(
      /session|token|expired/i.test(error.message)
        ? "Your reset link has expired. Request a new one."
        : error.message,
    );
  }

  return actionSuccess("Password updated. You can continue to your projects.");
}

/**
 * Promotes the first registered account to platform admin.
 * The signup trigger already does this; this is a manual recovery path.
 */
export async function claimFirstAdminAction(): Promise<ActionState> {
  if (!isAdminConfigured()) {
    return actionError("Server admin key is not configured on this deployment.");
  }

  const admin = createAdminClient();
  const { data: profiles } = await admin.from("profiles").select("id").limit(1);
  if (profiles && profiles.length > 0) {
    return actionError("An account already exists, so first-admin claim is closed.");
  }

  const { id } = await requireUser();
  const { error } = await admin.from("profiles").update({ role: "admin" }).eq("id", id);
  if (error) return actionError(error.message);

  revalidatePath("/dashboard");
  return actionSuccess("You are now a platform admin.");
}

/* ------------------------------------------------------------------ */
/*  Profile                                                           */
/* ------------------------------------------------------------------ */

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      fullName: z.string().trim().min(1, "Name is required.").max(80),
      jobTitle: z.string().trim().max(80).optional(),
    })
    .safeParse({ fullName: formData.get("fullName"), jobTitle: formData.get("jobTitle") });

  if (!parsed.success) {
    return actionError("Check the form and try again.", firstFieldError(parsed.error));
  }

  const { id } = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      job_title: parsed.data.jobTitle || null,
    })
    .eq("id", id);

  if (error) return actionError(error.message);

  revalidatePath("/settings");
  return actionSuccess("Profile updated.");
}

/* ------------------------------------------------------------------ */
/*  Projects                                                          */
/* ------------------------------------------------------------------ */

const projectSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  description: z.string().trim().max(2000).optional(),
  goal: z.string().trim().max(1000).optional(),
  scope: z.string().trim().max(2000).optional(),
  users: z.string().optional(),
  constraints: z.string().optional(),
});

function buildContext(data: z.infer<typeof projectSchema>): ProjectContext {
  return {
    goal: data.goal ?? "",
    scope: data.scope ?? "",
    users: (data.users ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    constraints: (data.constraints ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    goal: formData.get("goal"),
    scope: formData.get("scope"),
    users: formData.get("users"),
    constraints: formData.get("constraints"),
  });

  if (!parsed.success) {
    return actionError("Check the form and try again.", firstFieldError(parsed.error));
  }

  const { id: userId } = await requireUser();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("projects").select("slug");
  const slug = uniqueSlug(parsed.data.name, (existing ?? []).map((p) => p.slug));

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? "",
      context: buildContext(parsed.data),
      owner_id: userId,
    })
    .select("id")
    .single();

  if (error) return actionError(error.message);

  revalidatePath("/dashboard");
  redirect(`/projects/${data.id}`);
}

export async function updateProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return actionError("Missing project id.", { projectId: "Required" });

  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    goal: formData.get("goal"),
    scope: formData.get("scope"),
    users: formData.get("users"),
    constraints: formData.get("constraints"),
  });

  if (!parsed.success) {
    return actionError("Check the form and try again.", firstFieldError(parsed.error));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("You must be signed in.", { name: "Not signed in" });

  const { data: member } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (member?.role as AppRole | undefined) ?? "viewer";
  if (role !== "admin" && role !== "editor") {
    return actionError("You need editor access to update this project.", { name: "Forbidden" });
  }

  const { error } = await supabase
    .from("projects")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      context: buildContext(parsed.data),
    })
    .eq("id", projectId);

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  return actionSuccess("Project updated.");
}

export async function setProjectStatusAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  const status = String(formData.get("status") ?? "draft");
  if (!projectId) return;

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();

  const role = member?.role as AppRole | undefined;
  if (role !== "admin" && role !== "editor") return;

  await supabase
    .from("projects")
    .update({ status: status as never, archived_at: status === "archived" ? new Date().toISOString() : null })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: project } = await supabase
    .from("projects")
    .select("owner_id")
    .eq("id", projectId)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isOwner = project?.owner_id === user.id;
  const isAdmin = profile?.role === "admin";
  if (!isOwner && !isAdmin) return;

  await supabase.from("projects").delete().eq("id", projectId);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function duplicateProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return actionError("Missing project id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("You must be signed in.");

  const { data: source } = await supabase.from("projects").select("*").eq("id", projectId).single();
  if (!source) return actionError("Project not found.");

  const { data: existing } = await supabase.from("projects").select("slug");
  const slug = uniqueSlug(
    `${source.name} copy`,
    (existing ?? []).map((p) => p.slug),
  );

  const { data: created, error } = await supabase
    .from("projects")
    .insert({
      name: `${source.name} (copy)`,
      slug,
      description: source.description,
      context: source.context,
      owner_id: user.id,
    })
    .select("id")
    .single();

  if (error) return actionError(error.message);

  // Copy the API spec and endpoints too.
  const { data: specs } = await supabase
    .from("api_specs")
    .select("*")
    .eq("project_id", projectId);

  for (const spec of specs ?? []) {
    const { data: newSpec } = await supabase
      .from("api_specs")
      .insert({
        project_id: created.id,
        name: spec.name,
        version: spec.version,
        base_url: spec.base_url,
        description: spec.description,
        servers: spec.servers,
      })
      .select("id")
      .single();

    if (!newSpec) continue;

    const { data: endpoints } = await supabase
      .from("api_endpoints")
      .select("*")
      .eq("api_spec_id", spec.id);

    if (endpoints?.length) {
      await supabase.from("api_endpoints").insert(
        endpoints.map(({ id: _id, api_spec_id: _specId, created_at: _c, updated_at: _u, ...rest }) => ({
          ...rest,
          api_spec_id: newSpec.id,
        })),
      );
    }
  }

  revalidatePath("/dashboard");
  redirect(`/projects/${created.id}`);
}

/* ------------------------------------------------------------------ */
/*  Project members                                                   */
/* ------------------------------------------------------------------ */

export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "viewer") as AppRole;

  if (!projectId) return actionError("Missing project id.");
  if (!emailSchema.safeParse(email).success) {
    return actionError("Enter a valid email address.", { email: "Invalid email" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("You must be signed in.");

  const { data: member } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (member?.role !== "admin") {
    return actionError("Only project admins can add members.", { email: "Forbidden" });
  }

  // RLS only exposes profiles the caller shares a project with, so the
  // email -> id lookup needs the elevated key.
  if (!isAdminConfigured()) {
    return actionError(
      "This deployment has no admin key, so members cannot be looked up by email.",
      { email: "Admin key required" },
    );
  }

  const admin = createAdminClient();

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const target = list?.users.find((u) => u.email?.toLowerCase() === email);

  if (!target?.id) {
    return actionError("No registered account uses that email address. Ask them to sign up first.", {
      email: "Account not found",
    });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  const targetId = profile?.id ?? target.id;

  const { error } = await supabase
    .from("project_members")
    .upsert({ project_id: projectId, user_id: targetId, role }, { onConflict: "project_id,user_id" });

  if (error) return actionError(error.message);

  revalidatePath(`/projects/${projectId}/settings`);
  return actionSuccess(`Added ${email} as ${role}.`);
}

export async function updateMemberRoleAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "viewer") as AppRole;
  if (!projectId || !userId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (error) return;
  revalidatePath(`/projects/${projectId}/settings`);
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("projectId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!projectId || !userId) return;

  const supabase = await createClient();
  await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);

  revalidatePath(`/projects/${projectId}/settings`);
}
