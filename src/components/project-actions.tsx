"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { Alert, Button, Field, Input, Modal, Textarea } from "@/components/ui";
import {
  createProjectAction,
  deleteProjectAction,
  duplicateProjectAction,
  setProjectStatusAction,
} from "@/app/actions/auth";
import { IDLE, type ActionState } from "@/lib/utils";
import type { ProjectSummary } from "@/lib/types";

function Submit({ label, formId }: { label: string; formId?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" form={formId} loading={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/*  Create project                                                    */
/* ------------------------------------------------------------------ */

export function CreateProjectButton() {
  const [open, setOpen] = React.useState(false);
  const [state, action] = useActionState<ActionState, FormData>(createProjectAction, IDLE);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <span>New project</span>
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a project"
        description="Set the context once and every module picks it up."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label="Create project" formId="create-project-form" />
          </>
        }
      >
        <form id="create-project-form" action={action} className="space-y-4">
          {state.status !== "idle" ? (
            <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert>
          ) : null}

          <Field label="Project name" required error={state.fieldErrors?.name}>
            <Input name="name" required autoFocus placeholder="Order Management Platform" />
          </Field>

          <Field label="Description" hint="optional">
            <Textarea
              name="description"
              rows={2}
              placeholder="What does this system do and why does it exist?"
            />
          </Field>

          <Field label="Goal" hint="what success looks like">
            <Textarea name="goal" rows={2} placeholder="Cut order fulfilment time from 4h to under 15 minutes." />
          </Field>

          <Field label="Scope" hint="one line per item">
            <Textarea name="scope" rows={2} placeholder="In scope: checkout, payment, fulfilment tracking" />
          </Field>

          <Field label="Users and actors" hint="one per line">
            <Textarea name="users" rows={3} placeholder="Customer{'\n'}Support agent{'\n'}Warehouse operator" />
          </Field>

          <Field label="Constraints" hint="one per line">
            <Textarea
              name="constraints"
              rows={3}
              placeholder="Must run in ap-southeast-1{'\n'}SOC 2 compliance required{'\n'}Budget under $2k/month"
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Duplicate project                                                 */
/* ------------------------------------------------------------------ */

export function DuplicateProjectButton({ project }: { project: { id: string; name: string } }) {
  const [open, setOpen] = React.useState(false);
  const [state, action] = useActionState<ActionState, FormData>(duplicateProjectAction, IDLE);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Duplicate
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Duplicate "${project.name}"`}
        description="The copy includes diagrams, API specs, endpoints, decisions and cost selections."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label="Duplicate project" formId="duplicate-project-form" />
          </>
        }
      >
        <form id="duplicate-project-form" action={action}>
          <input type="hidden" name="projectId" value={project.id} />
          {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
        </form>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Delete project                                                    */
/* ------------------------------------------------------------------ */

export function DeleteProjectButton({
  project,
  variant = "outline",
  size = "sm",
  label = "Delete",
}: {
  project: { id: string; name: string };
  variant?: "outline" | "danger";
  size?: "sm" | "md";
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this project?"
        description="This permanently removes every diagram, endpoint, decision and record. It cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <form action={deleteProjectAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <Button type="submit" variant="danger" disabled={confirm !== project.name}>
                Delete permanently
              </Button>
            </form>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm">
            Type <span className="font-mono font-semibold">{project.name}</span> to confirm.
          </p>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={project.name}
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Status control                                                    */
/* ------------------------------------------------------------------ */

export function ProjectStatusSelect({
  project,
  options,
}: {
  project: { id: string; status: string };
  options: { id: string; label: string }[];
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <select
      value={project.status}
      disabled={pending}
      onChange={(e) => {
        const status = e.target.value;
        const fd = new FormData();
        fd.set("projectId", project.id);
        fd.set("status", status);
        startTransition(async () => {
          await setProjectStatusAction(fd);
        });
      }}
      className="h-8 rounded-md border border-input bg-card px-2 text-xs transition-colors focus:border-primary focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export type { ProjectSummary };
