"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea } from "@/components/ui";
import { updateProjectAction } from "@/app/actions/auth";
import { IDLE, type ActionState } from "@/lib/utils";
import type { ProjectSummary } from "@/lib/types";

const CHAR_BULLET = "\u2022";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} size="sm">
      {pending ? "Saving\u2026" : "Save project"}
    </Button>
  );
}

export function ProjectSettingsForm({ project }: { project: ProjectSummary }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProjectAction, IDLE);
  const ctx = project.context ?? {};

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="projectId" value={project.id} />

      {state.status !== "idle" ? (
        <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name" required error={state.fieldErrors?.name}>
          <Input name="name" defaultValue={project.name} required />
        </Field>
        <Field label="Slug" hint="read-only">
          <Input value={project.slug} disabled readOnly className="font-mono" />
        </Field>
      </div>

      <Field label="Description">
        <Textarea name="description" rows={2} defaultValue={project.description} />
      </Field>

      <Field label="Goal" hint="what success looks like">
        <Textarea name="goal" rows={2} defaultValue={(ctx.goal as string) ?? ""} />
      </Field>

      <Field label="Scope" hint="free text">
        <Textarea name="scope" rows={2} defaultValue={(ctx.scope as string) ?? ""} />
      </Field>

      <Field label="Users and actors" hint="one per line">
        <Textarea
          name="users"
          rows={3}
          defaultValue={Array.isArray(ctx.users) ? (ctx.users as string[]).join("\n") : ""}
        />
      </Field>

      <Field label="Constraints" hint="one per line">
        <Textarea
          name="constraints"
          rows={3}
          defaultValue={Array.isArray(ctx.constraints) ? (ctx.constraints as string[]).join("\n") : ""}
        />
      </Field>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}

export function ContextCard({ project }: { project: ProjectSummary }) {
  const ctx = project.context ?? {};
  const users = Array.isArray(ctx.users) ? (ctx.users as string[]) : [];
  const constraints = Array.isArray(ctx.constraints) ? (ctx.constraints as string[]) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>System context</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-xs font-medium text-muted-foreground">Goal</h4>
          <p className="mt-1 text-sm leading-relaxed">
            {(ctx.goal as string) || <span className="text-muted-foreground">Not set yet.</span>}
          </p>
        </div>

        <div>
          <h4 className="text-xs font-medium text-muted-foreground">Scope</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
            {(ctx.scope as string) || <span className="text-muted-foreground">Not set yet.</span>}
          </p>
        </div>

        <div>
          <h4 className="text-xs font-medium text-muted-foreground">Users and actors</h4>
          {users.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {users.map((u) => (
                <li key={u} className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">{CHAR_BULLET}</span>
                  {u}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Not set yet.</p>
          )}
        </div>

        <div>
          <h4 className="text-xs font-medium text-muted-foreground">Constraints</h4>
          {constraints.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {constraints.map((c) => (
                <li key={c} className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">{CHAR_BULLET}</span>
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Not set yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
