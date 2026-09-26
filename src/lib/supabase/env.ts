/**
 * Supabase environment configuration checks.
 *
 * These helpers exist so a missing key produces an actionable message instead of
 * an opaque failure from inside the Supabase SDK. They are safe to import from
 * the proxy, Server Components and Client Components (no `server-only`).
 */

const PUBLIC_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

const SECRET_VARS = ["SUPABASE_SECRET_KEY"] as const;

function missingFrom(vars: readonly string[]): string[] {
  return vars.filter((name) => {
    const value = process.env[name];
    return !value || value.trim() === "";
  });
}

/** Public keys missing. Without these nothing can render authenticated pages. */
export function missingPublicEnv(): string[] {
  return missingFrom(PUBLIC_VARS);
}

/** Secret keys missing. Only needed for admin calls such as member invites. */
export function missingSecretEnv(): string[] {
  return missingFrom(SECRET_VARS);
}

export function isSupabaseConfigured(): boolean {
  return missingPublicEnv().length === 0;
}

/** One-paragraph explanation used by the setup screen and thrown errors. */
export function supabaseConfigMessage(missing: string[] = missingPublicEnv()): string {
  return [
    "Supabase is not configured, so the app cannot reach the database.",
    missing.length > 0
      ? `Missing environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`
      : "The public Supabase variables are present but no session could be established.",
    "Add them to .env.local (local) or to the project's environment variables (hosted), then restart.",
    "Find the values in Supabase Dashboard -> Project Settings -> API.",
  ].join(" ");
}

/**
 * Returns the public Supabase values, throwing a readable error when unset.
 * Use this instead of passing possibly-empty strings straight to the SDK.
 */
export function requirePublicEnv(): { url: string; publishableKey: string } {
  const missing = missingPublicEnv();
  if (missing.length > 0) {
    throw new Error(supabaseConfigMessage(missing));
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim(),
  };
}
