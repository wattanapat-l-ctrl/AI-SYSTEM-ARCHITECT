"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Alert, Button, Field, Input, Modal, Textarea } from "@/components/ui";
import { IDLE, type ActionState } from "@/lib/utils";
import { createSpecAction, updateSpecAction } from "@/app/actions/api";
import type { ApiSpec } from "@/lib/types";

export function SpecDialog({
  projectId,
  spec,
  open,
  onClose,
}: {
  projectId: string;
  spec: ApiSpec | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(spec);

  const [state, formAction] = React.useActionState<ActionState, FormData>(
    isEdit ? updateSpecAction : createSpecAction,
    IDLE,
  );

  const [name, setName] = React.useState(spec?.name ?? "");
  const [version, setVersion] = React.useState(spec?.version ?? "1.0.0");
  const [baseUrl, setBaseUrl] = React.useState(spec?.base_url ?? "");
  const [description, setDescription] = React.useState(spec?.description ?? "");
  const lastHandled = React.useRef("");

  // Creating a spec returns its new id, so refresh the list behind the dialog.
  React.useEffect(() => {
    if (state.status !== "success" || isEdit) return;
    if (lastHandled.current === state.message) return;
    lastHandled.current = state.message;
    onClose();
    router.refresh();
  }, [state, isEdit, onClose, router]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "API settings" : "Define a new API"}
      description={
        isEdit
          ? undefined
          : "The base URL and version are used for the OpenAPI document and every generated artefact."
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SpecSubmit isEdit={isEdit} />
        </>
      }
    >
      <form id="spec-form" action={formAction} className="space-y-4">
        {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

        <input type="hidden" name="projectId" value={projectId} />
        {spec ? <input type="hidden" name="apiSpecId" value={spec.id} /> : null}

        <Field label="Name" required error={state.fieldErrors?.name}>
          <Input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Order API"
            required
            autoFocus={!isEdit}
          />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Version" hint="semver" required error={state.fieldErrors?.version}>
            <Input
              name="version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
              required
            />
          </Field>

          <Field label="Base URL" required error={state.fieldErrors?.baseUrl}>
            <Input
              name="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              required
            />
          </Field>
        </div>

        <Field label="Description" hint="optional">
          <Textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What this API is responsible for"
          />
        </Field>
      </form>
    </Modal>
  );
}

function SpecSubmit({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" form="spec-form" loading={pending}>
      {pending ? "Saving…" : isEdit ? "Save changes" : "Create API"}
    </Button>
  );
}
