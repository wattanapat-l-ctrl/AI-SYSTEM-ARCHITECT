import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "@/components/auth-forms";

export const metadata = { title: "New password" };

/**
 * Supabase redirects here with a recovery token in the URL hash.
 * The session is already established by the time this renders, so we only
 * need to confirm it is a real, logged-in recovery session.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/forgot-password");

  return <UpdatePasswordForm />;
}
