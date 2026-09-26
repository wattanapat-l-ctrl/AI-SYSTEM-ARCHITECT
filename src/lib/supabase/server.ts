import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requirePublicEnv } from "./env";

/**
 * Supabase client bound to the current request's cookies.
 * Use in Server Components, Server Actions and Route Handlers.
 * RLS applies, so every query is automatically scoped to the signed-in user.
 */
export async function createClient() {
  // Read cookies first on purpose. Calling cookies() is what tells Next that
  // this route depends on the request, so it is rendered per request instead of
  // being prerendered at build time. Validating the environment afterwards
  // keeps that signal from being skipped when a variable is missing.
  const cookieStore = await cookies();
  const { url, publishableKey } = requirePublicEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component: cookie writes are not allowed there.
          // The proxy refreshes the session instead, so this can be ignored.
        }
      },
    },
  });
}
