"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import { DIAGRAM_KIND_META, DIAGRAM_KINDS } from "@/lib/constants";
import { formatDateTime, relativeTime } from "@/lib/utils";
import { IDLE, type ActionState } from "@/lib/utils";
import type { Diagram } from "@/lib/types";
import { createDiagramAction, deleteDiagramAction, seedStarterDiagramAction } from "@/app/actions/diagrams";
import { VersionHistory } from "@/components/diagram/version-history";

/* ================================================================== */
/*  Seed starter diagram                                              */
/* ================================================================== */

function SeedSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending} className="shrink-0">
      {pending ? "Seeding…" : "Seed starter diagram"}
    </Button>
  );
}

export function SeedStarterButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, formAction] = React.useActionState<ActionState, FormData>(
    seedStarterDiagramAction,
    IDLE,
  );
  const lastHandled = React.useRef<string>("");

  React.useEffect(() => {
    if (state.status !== "success") return;
    if (lastHandled.current === state.message) return;
    lastHandled.current = state.message;
    router.push(`/projects/${projectId}/architecture/${state.message}`);
  }, [state, projectId, router]);

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="projectId" value={projectId} />
      {state.status === "error" ? (
        <p className="mb-2 text-xs text-destructive">{state.message}</p>
      ) : null}
      <SeedSubmit />
    </form>
  );
}

export function DiagramList({
  projectId,
  diagrams,
  canEdit,
}: {
  projectId: string;
  diagrams: Diagram[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [historyFor, setHistoryFor] = React.useState<Diagram | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Diagram | null>(null);

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setCreating(true)}>
            New diagram
          </Button>
          <p className="text-xs text-muted-foreground">
            Start from a blank canvas or a C4 / infrastructure / data-flow template.
          </p>
        </div>
      ) : null}

      {diagrams.length === 0 ? (
        <Card>
          <EmptyState
            icon="🗺️"
            title="No diagrams yet"
            description={
              canEdit
                ? "Create your first architecture diagram to start mapping components, layers and communication paths."
                : "The designer has not published any diagrams for this project yet."
            }
            action={
              canEdit ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  New diagram
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {diagrams.map((diagram) => {
            const meta = DIAGRAM_KIND_META[diagram.kind];
            return (
              <Card
                key={diagram.id}
                className="group flex flex-col gap-3 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-xl leading-none">{meta?.icon ?? "🗺️"}</span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/projects/${projectId}/architecture/${diagram.id}`}
                      className="block truncate text-sm font-semibold hover:text-primary"
                    >
                      {diagram.name}
                    </a>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {meta?.label ?? diagram.kind}
                    </p>
                  </div>
                  <Badge tone={diagram.kind.startsWith("c4") ? "info" : "muted"}>
                    v{diagram.current_version}
                  </Badge>
                </div>

                <p className="line-clamp-2 min-h-8 text-[11px] leading-relaxed text-muted-foreground">
                  {diagram.description || "No description"}
                </p>

                <div className="mt-auto flex items-center justify-between border-t border-border pt-2.5 text-[10px] text-muted-foreground">
                  <span title={formatDateTime(diagram.updated_at)}>
                    Updated {relativeTime(diagram.updated_at)}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setHistoryFor(diagram)}>
                      History
                    </Button>
                    {canEdit ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPendingDelete(diagram)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateDiagramModal projectId={projectId} open={creating} onClose={() => setCreating(false)} />

      {historyFor ? (
        <VersionHistory
          projectId={projectId}
          diagram={historyFor}
          canEdit={canEdit}
          onClose={() => setHistoryFor(null)}
        />
      ) : null}

      {pendingDelete ? (
        <DeleteDiagramDialog
          projectId={projectId}
          diagram={pendingDelete}
          onDone={() => {
            setPendingDelete(null);
            router.refresh();
          }}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}

/* ================================================================== */
/*  Create dialog                                                     */
/* ================================================================== */

function CreateDiagramModal({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = React.useActionState<ActionState, FormData>(
    createDiagramAction,
    IDLE,
  );
  const [kind, setKind] = React.useState("c4_container");
  const lastHandled = React.useRef<string>("");

  // On success the action returns the new diagram id as its message; send the
  // user straight into the editor.
  React.useEffect(() => {
    if (state.status !== "success") return;
    if (lastHandled.current === state.message) return;
    lastHandled.current = state.message;
    onClose();
    router.push(`/projects/${projectId}/architecture/${state.message}`);
  }, [state, onClose, projectId, router]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New architecture diagram"
      description="Pick a template; every component stays editable afterwards."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <CreateSubmit />
        </>
      }
    >
      <form id="create-diagram-form" action={formAction} className="space-y-4">
        {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

        <input type="hidden" name="projectId" value={projectId} />

        <Field label="Name" required error={state.fieldErrors?.name}>
          <Input name="name" required autoFocus placeholder="System context" />
        </Field>

        <Field
          label="Template"
          error={state.fieldErrors?.kind}
          hint={DIAGRAM_KIND_META[kind as keyof typeof DIAGRAM_KIND_META]?.description}
        >
          <Select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {DIAGRAM_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.icon} {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Description" hint="optional">
          <Textarea
            name="description"
            rows={3}
            placeholder="What this diagram documents and which decisions it captures"
          />
        </Field>
      </form>
    </Modal>
  );
}

function CreateSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" form="create-diagram-form" loading={pending}>
      {pending ? "Creating…" : "Create diagram"}
    </Button>
  );
}

/* ================================================================== */
/*  Delete dialog                                                     */
/* ================================================================== */

function DeleteDiagramDialog({
  projectId,
  diagram,
  onDone,
  onCancel,
}: {
  projectId: string;
  diagram: Diagram;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState("");

  const remove = () => {
    start(async () => {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("diagramId", diagram.id);
      const result = await deleteDiagramAction(form);
      if (result.status === "success") {
        onDone();
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Delete diagram"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={pending} onClick={remove}>
            Delete diagram
          </Button>
        </>
      }
    >
      {error ? (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}

      <p className="text-sm">
        Delete <span className="font-semibold">{diagram.name}</span>?
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        The diagram and all {diagram.current_version} saved version
        {diagram.current_version === 1 ? "" : "s"} will be removed permanently. This cannot be undone.
      </p>
    </Modal>
  );
}
