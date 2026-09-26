import { SignInForm } from "@/components/auth-forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params?.next === "string" ? params.next : undefined;

  return <SignInForm nextPath={next} />;
}
