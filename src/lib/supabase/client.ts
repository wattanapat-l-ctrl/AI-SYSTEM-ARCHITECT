import { createBrowserClient } from "@supabase/ssr";

import { requirePublicEnv } from "./env";

/**
 * Supabase client for Client Components.
 * Uses the publishable (anon-safe) key only.
 */
export function createClient() {
  const { url, publishableKey } = requirePublicEnv();

  return createBrowserClient(url, publishableKey);
}
