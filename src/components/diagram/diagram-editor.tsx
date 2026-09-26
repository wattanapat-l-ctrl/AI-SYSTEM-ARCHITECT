"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { DiagramCanvas } from "@/components/diagram/canvas";
import { VersionHistory } from "@/components/diagram/version-history";
import { DIAGRAM_KIND_META, DIAGRAM_KINDS } from "@/lib/constants";
import { importDiagramAction, saveDiagramVersionAction, updateDiagramMetaAction } from "@/app/actions/diagrams";
import { IDLE, type ActionState } from "@/lib/utils";
import type { Diagram, DiagramVersion } from "@/lib/types";
import type { Viewport } from "@xyflow/react";

type SaveResult = { ok: boolean; message: string };

export function DiagramEditor({
  projectId,
  diagram,
  headVersion,
  readOnly,
}: {
  projectId: string;
  diagram: Diagram;
  headVersion: DiagramVersion | null;
  readOnly: boolean;
}) {
  const router = useRouter();

  const [showHistory, setShowHistory] = React.useState(false);
  const [showMeta, setShowMeta] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [version, setVersion] = React.useState(diagram.current_version);

  const meta = DIAGRAM_KIND_META[diagram.kind];

  const save = async (payload: {
    nodes: unknown[];
    edges: unknown[];
    viewport: Viewport;
    notes: string;
  }): Promise<SaveResult> => {
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("diagramId", diagram.id);
    form.set("notes", payload.notes);
    form.set("nodes", JSON.stringify(payload.nodes));
    form.set("edges", JSON.stringify(payload.edges));
    form.set("viewport", JSON.stringify(payload.viewport));

    const result: ActionState = await saveDiagramVersionAction(IDLE, form);

    if (result.status === "error") {
      return { ok: false, message: result.message };
    }

    const match = /version (\d+)/i.exec(result.message);
    if (match) setVersion(Number(match[1]));
    router.refresh();
    return { ok: true, message: result.message };
  };

  return (
    // The app shell adds a 3.5rem sticky header on mobile only, so the canvas
    // gets a different budget per breakpoint. Height is driven from here and
    // flows down to the canvas via flex-1.
    <div className="flex h-[calc(100dvh-7rem)] flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <a
          href={`/projects/${projectId}/architecture`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Diagrams
        </a>

        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{diagram.name}</h1>
          <p className="truncate text-[10px] text-muted-foreground">
            {meta?.label ?? diagram.kind}
            {diagram.description ? ` · ${diagram.description}` : ""}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setShowHistory(true)}>
            Version history
          </Button>

          {!readOnly ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setShowImport(true)}>
                Import
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowMeta(true)}>
                Details
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <DiagramCanvas
          // Remount when a new head version arrives (save, restore or import),
          // otherwise the canvas would keep showing stale local state.
        key={`${diagram.id}:${headVersion?.id ?? "empty"}`}
        diagramId={diagram.id}
          version={version}
          readOnly={readOnly}
          initialNodes={headVersion?.nodes ?? []}
          initialEdges={headVersion?.edges ?? []}
          initialViewport={(headVersion?.viewport as Viewport | undefined) ?? null}
          onSave={save}
        />
      </div>

      {showHistory ? (
        <VersionHistory
          projectId={projectId}
          diagram={{ ...diagram, current_version: version }}
          canEdit={!readOnly}
          onClose={() => setShowHistory(false)}
        />
      ) : null}

      {showMeta ? (
        <DetailsDialog
          projectId={projectId}
          diagram={diagram}
          onClose={() => setShowMeta(false)}
        />
      ) : null}

      {showImport ? (
        <ImportDialog
          projectId={projectId}
          diagramId={diagram.id}
          onClose={() => setShowImport(false)}
        />
      ) : null}
    </div>
  );
}

/* ================================================================== */
/*  Details dialog                                                    */
/* ================================================================== */

function DetailsDialog({
  projectId,
  diagram,
  onClose,
}: {
  projectId: string;
  diagram: Diagram;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(diagram.name);
  const [description, setDescription] = React.useState(diagram.description);
  const [kind, setKind] = React.useState(diagram.kind);
  const [state, setState] = React.useState<ActionState>(IDLE);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("diagramId", diagram.id);
    form.set("name", name);
    form.set("description", description);
    form.set("kind", kind);

    const result = await updateDiagramMetaAction(IDLE, form);
    setBusy(false);
    setState(result);
    if (result.status === "success") {
      router.refresh();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Diagram details</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-4">
          {state.status === "error" ? (
            <p className="text-xs text-destructive">{state.message}</p>
          ) : null}

          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>

          <Field label="Template">
            <Select value={kind} onChange={(e) => setKind(e.target.value as Diagram["kind"])}>
              {DIAGRAM_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.icon} {k.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Description" hint="optional">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save details
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Import dialog                                                     */
/* ================================================================== */

function ImportDialog({
  projectId,
  diagramId,
  onClose,
}: {
  projectId: string;
  diagramId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [payload, setPayload] = React.useState("");
  const [state, setState] = React.useState<ActionState>(IDLE);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("diagramId", diagramId);
    form.set("payload", payload);
    const result = await importDiagramAction(IDLE, form);
    setBusy(false);
    setState(result);
    if (result.status === "success") {
      router.refresh();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Import diagram JSON</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-4">
          {state.status === "error" ? (
            <p className="text-xs text-destructive">{state.message}</p>
          ) : null}

          <Field
            label="JSON payload"
            hint='Expected {"nodes": [...], "edges": [...], "viewport": {...}}'
            required
          >
            <Textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={8}
              className="font-mono text-[11px]"
              placeholder='{"nodes": [], "edges": []}'
            />
          </Field>

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Use Actions → Export JSON in the canvas toolbar to download a file you can edit and import
            back here. The import is stored as a new version, so nothing is overwritten.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Import as new version
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
