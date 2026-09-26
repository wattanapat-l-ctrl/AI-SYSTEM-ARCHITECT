import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the email-confirmation callback.
 * Supabase exchanges the code for a session here, then we send the user on.
 */
export default async function AuthConfirmPage({
  searchParams,
  hash,
}: PageProps<"/auth/confirm"> & { hash?: string }) {
  const params = await searchParams;
  const code = typeof params?.code === "string" ? params.code : null;
  const nextParam = typeof params?.next === "string" ? params.next : "/dashboard";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(nextParam);
  }

  // Implicit-flow fallback: Supabase returns the tokens in the URL fragment.
  if (typeof hash === "string" && hash.length > 1) {
    const fragment = new URLSearchParams(hash.slice(1));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");

    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!error) redirect(nextParam);
    }
  }

  redirect("/login?error=confirmation_failed");
}
