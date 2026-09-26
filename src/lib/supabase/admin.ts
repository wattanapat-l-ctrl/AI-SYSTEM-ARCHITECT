import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client that bypasses RLS using the secret key.
 *
 * SECURITY: this module is `server-only` and the key is read from a
 * server-side env var that is never exposed to the browser. Use it only for
 * operations that genuinely need elevated access (for example creating the
 * `auth.admin` user during sign-up, or system-level cleanup jobs).
 *
 * Most application code should use `createClient()` from ./server.ts so that
 * Row Level Security is enforced.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY. Add it to .env.local to enable admin operations.",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}
