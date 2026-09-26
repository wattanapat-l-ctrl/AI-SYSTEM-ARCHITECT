"use client";

import * as React from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { IDLE, type ActionState } from "@/lib/utils";
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
} from "@/app/actions/auth";

/* ------------------------------------------------------------------ */
/*  Shared shell                                                      */
/* ------------------------------------------------------------------ */

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
              AI
            </span>
            <span className="text-sm">System Architect</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-5 text-center text-xs text-muted-foreground">{footer}</div> : null}
      </div>
    </div>
  );
}

function SubmitButton({ label, loadingLabel }: { label: string; loadingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" loading={pending}>
      {pending ? loadingLabel : label}
    </Button>
  );
}

function StateAlert({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  return (
    <Alert tone={state.status === "error" ? "danger" : "success"} className="mb-4">
      {state.message}
    </Alert>
  );
}

/* ------------------------------------------------------------------ */
/*  Sign in                                                           */
/* ------------------------------------------------------------------ */

export function SignInForm({ nextPath }: { nextPath?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(signInAction, IDLE);

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your architecture workspace."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <StateAlert state={state} />
      <form action={action} className="space-y-4">
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
        <Field label="Email" error={state.fieldErrors?.email}>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            autoFocus
          />
        </Field>
        <Field label="Password" error={state.fieldErrors?.password}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Forgot password?
          </Link>
        </div>
        <SubmitButton label="Sign in" loadingLabel="Signing in\u2026" />
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Sign up                                                           */
/* ------------------------------------------------------------------ */

export function SignUpForm() {
  const [state, action] = useActionState<ActionState, FormData>(signUpAction, IDLE);

  return (
    <AuthShell
      title="Create your account"
      subtitle="Your first account becomes the workspace admin."
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <StateAlert state={state} />
      <form action={action} className="space-y-4">
        <Field label="Full name" error={state.fieldErrors?.fullName}>
          <Input name="fullName" required autoComplete="name" placeholder="Jane Doe" autoFocus />
        </Field>
        <Field label="Email" error={state.fieldErrors?.email}>
          <Input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Password" hint="8+ characters" error={state.fieldErrors?.password}>
          <Input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
          />
        </Field>
        <SubmitButton label="Create account" loadingLabel="Creating account\u2026" />
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Forgot password                                                   */
/* ------------------------------------------------------------------ */

export function ForgotPasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(
    requestPasswordResetAction,
    IDLE,
  );

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will email you a secure reset link."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <StateAlert state={state} />
      <form action={action} className="space-y-4">
        <Field label="Email" error={state.fieldErrors?.email}>
          <Input name="email" type="email" required autoComplete="email" autoFocus />
        </Field>
        <SubmitButton label="Send reset link" loadingLabel="Sending\u2026" />
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Update password                                                   */
/* ------------------------------------------------------------------ */

export function UpdatePasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(updatePasswordAction, IDLE);

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something you have not used before."
      footer={
        <Link href="/dashboard" className="font-medium text-primary hover:underline">
          Skip for now
        </Link>
      }
    >
      <StateAlert state={state} />
      <form action={action} className="space-y-4">
        <Field label="New password" hint="8+ characters" error={state.fieldErrors?.password}>
          <Input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
          />
        </Field>
        <Field label="Confirm password" error={state.fieldErrors?.confirm}>
          <Input name="confirm" type="password" required autoComplete="new-password" />
        </Field>
        <SubmitButton label="Update password" loadingLabel="Updating\u2026" />
      </form>
    </AuthShell>
  );
}
