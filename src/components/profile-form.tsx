"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "@/components/ui";
import { updateProfileAction } from "@/app/actions/auth";
import { IDLE, type ActionState } from "@/lib/utils";
import type { Profile } from "@/lib/types";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} size="sm">
      {pending ? "Saving\u2026" : "Save changes"}
    </Button>
  );
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProfileAction, IDLE);

  return (
    <form action={action} className="space-y-4">
      {state.status !== "idle" ? (
        <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert>
      ) : null}

      <Field label="Full name" required error={state.fieldErrors?.fullName}>
        <Input name="fullName" defaultValue={profile.full_name ?? ""} required />
      </Field>

      <Field label="Job title" hint="optional">
        <Input name="jobTitle" defaultValue={profile.job_title ?? ""} placeholder="Principal Engineer" />
      </Field>

      <Field label="Email" hint="managed by Supabase Auth">
        <Input value={profile.email} disabled readOnly />
      </Field>

      <Field label="Platform role" hint="set by the first-account trigger">
        <Input value={profile.role} disabled readOnly />
      </Field>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}

export function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        Use the toggle at the bottom of the sidebar to switch between light and dark. Your choice is
        saved in this browser.
      </CardContent>
    </Card>
  );
}
