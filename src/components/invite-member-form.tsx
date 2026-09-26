"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { inviteMemberAction } from "@/app/actions/auth";
import { IDLE, type ActionState } from "@/lib/utils";
import { ROLES } from "@/lib/constants";

function InviteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending}>
      {pending ? "Adding\u2026" : "Add member"}
    </Button>
  );
}

export function InviteMemberForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(inviteMemberAction, IDLE);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />

      {state.status !== "idle" ? (
        <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label="Email address" error={state.fieldErrors?.email}>
          <Input name="email" type="email" required placeholder="teammate@company.com" />
        </Field>
        <Field label="Role">
          <Select name="role" defaultValue="editor">
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="pb-0.5">
          <InviteButton />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        The person must already have an account. Roles:{" "}
        {ROLES.map((r) => (
          <span key={r.id}>
            <strong className="text-foreground">{r.label}</strong> ({r.description})
            {r.id !== "viewer" ? " \u00b7 " : ""}
          </span>
        ))}
      </p>
    </form>
  );
}
