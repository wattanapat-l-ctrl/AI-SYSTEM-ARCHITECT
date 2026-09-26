"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteDocumentAction, saveDocumentAction } from "@/app/actions/planning";
import { markdownToPdf } from "@/lib/pdf";
import { IDLE, downloadText, formatDateTime, relativeTime, type ActionState } from "@/lib/utils";
import type { DocumentRow } from "@/lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";

const KIND_LABEL: Record<string, string> = {
  architecture: "Architecture",
  api: "API reference",
  adr: "Decisions",
  cost: "Cost model",
  custom: "Notes",
};

export interface GeneratedDocs {
  architecture: string;
  adr: string;
  cost: string;
  api: { id: string; name: string; markdown: string }[];
}

function DocumentEditor({
  projectId,
  document,
  open,
  onClose,
}: {
  projectId: string;
  document: DocumentRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(document);
  const [state, formAction, isPending] = React.useActionState<ActionState, FormData>(
    saveDocumentAction,
    IDLE,
  );
  const lastHandled = React.useRef("");

  const [title, setTitle] = React.useState(document?.title ?? "");
  const [kind, setKind] = React.useState(document?.kind ?? "custom");
  const [content, setContent] = React.useState(document?.content_markdown ?? "");

  React.useEffect(() => {
    if (state.status !== "success") return;
    if (lastHandled.current === state.message) return;
    lastHandled.current = state.message;
    onClose();
    router.refresh();
  }, [state, onClose, router]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? "Edit document" : "New document"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="document-form" loading={isPending}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="document-form" action={formAction} className="space-y-3.5">
        <input type="hidden" name="projectId" value={projectId} />
        {document ? <input type="hidden" name="documentId" value={document.id} /> : null}

        {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

        <div className="grid gap-3.5 sm:grid-cols-[1fr_12rem]">
          <Field label="Title" htmlFor="doc-title" required error={state.fieldErrors?.title}>
            <Input
              id="doc-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={300}
            />
          </Field>
          <Field label="Kind" htmlFor="doc-kind">
            <Select
              id="doc-kind"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              disabled={isEdit}
            >
              {Object.entries(KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Markdown"
          htmlFor="doc-content"
          hint={`${content.length.toLocaleString()} characters`}
        >
          <Textarea
            id="doc-content"
            name="content"
            rows={16}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="font-mono text-xs leading-relaxed"
          />
        </Field>
      </form>
    </Modal>
  );
}

export function DocumentationWorkspace({
  projectId,
  documents,
  canEdit,
  generated,
}: {
  projectId: string;
  documents: DocumentRow[];
  canEdit: boolean;
  generated: GeneratedDocs;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DocumentRow | null>(null);
  const [viewing, setViewing] = React.useState<DocumentRow | null>(null);
  const [error, setError] = React.useState("");
  const [exporting, setExporting] = React.useState(false);
  const [apiSpecId, setApiSpecId] = React.useState(generated.api[0]?.id ?? "");
  const [pendingKind, startTransition] = React.useTransition();

  const apiDoc = generated.api.find((s) => s.id === apiSpecId) ?? null;

  // One-shot generation writes straight to the server action.
  const generate = (kind: string, title: string, content: string) => {
    if (!content.trim()) {
      setError("There is nothing to generate yet.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("title", title);
      fd.set("kind", kind);
      fd.set("content", content);
      const result = await saveDocumentAction(IDLE, fd);
      if (result.status === "error") setError(result.message);
      else router.refresh();
    });
  };

  const exportPdf = async (doc: DocumentRow) => {
    setExporting(true);
    setError("");
    try {
      await markdownToPdf(doc.content_markdown, {
        title: doc.title,
        subtitle: "AI System Architect",
        footer: "Generated document",
      });
    } catch {
      setError("Could not render the PDF. Try the Markdown download instead.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {canEdit ? (
        <Card>
          <CardContent className="space-y-3">
            <div>
              <h2 className="text-sm font-medium">Generate from project data</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Each button writes a Markdown document from the current diagrams, API contract,
                decisions and cost model.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                loading={pendingKind}
                onClick={() =>
                  generate("architecture", "Architecture Documentation", generated.architecture)
                }
              >
                Architecture
              </Button>
              <Button
                size="sm"
                loading={pendingKind}
                onClick={() => generate("adr", "Architecture Decision Records", generated.adr)}
              >
                Decisions
              </Button>
              <Button
                size="sm"
                loading={pendingKind}
                onClick={() => generate("cost", "Infrastructure Cost Model", generated.cost)}
              >
                Cost model
              </Button>

              {generated.api.length > 0 ? (
                <span className="flex items-center gap-1.5">
                  <Select
                    value={apiSpecId}
                    onChange={(e) => setApiSpecId(e.target.value)}
                    className="h-8 max-w-48 text-xs"
                    aria-label="API specification to document"
                  >
                    {generated.api.map((spec) => (
                      <option key={spec.id} value={spec.id}>
                        {spec.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    loading={pendingKind}
                    onClick={() =>
                      apiDoc && generate("api", `${apiDoc.name} — API Reference`, apiDoc.markdown)
                    }
                  >
                    API reference
                  </Button>
                </span>
              ) : null}

              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                Write from scratch
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {documents.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="\u{1F4E6}"
              title="No documents yet"
              description="Generate the architecture, API, decision or cost document from the toolbar above, or write your own notes in Markdown."
              action={
                canEdit ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(null);
                      setDialogOpen(true);
                    }}
                  >
                    Write a document
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{doc.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Updated {relativeTime(doc.updated_at)} · {doc.content_markdown.length.toLocaleString()}{" "}
                      characters
                    </p>
                  </div>
                  <Badge tone="muted">{KIND_LABEL[doc.kind] ?? doc.kind}</Badge>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button size="sm" variant="secondary" onClick={() => setViewing(doc)}>
                    Read
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      downloadText(
                        `${doc.title.replace(/[^\w.-]+/g, "-").toLowerCase()}.md`,
                        doc.content_markdown,
                        "text/markdown",
                      )
                    }
                  >
                    Markdown
                  </Button>
                  <Button size="sm" variant="ghost" loading={exporting} onClick={() => void exportPdf(doc)}>
                    PDF
                  </Button>
                  {canEdit ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(doc);
                          setDialogOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("projectId", projectId);
                          fd.set("documentId", doc.id);
                          void deleteDocumentAction(fd).then((result) => {
                            if (result.status === "error") setError(result.message);
                            else router.refresh();
                          });
                        }}
                      >
                        Delete
                      </Button>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DocumentEditor
        key={editing?.id ?? "new"}
        projectId={projectId}
        document={editing}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
          router.refresh();
        }}
      />

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        size="xl"
        title={viewing?.title ?? ""}
        description={viewing ? `Last updated ${formatDateTime(viewing.updated_at)}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setViewing(null)}>
              Close
            </Button>
            {viewing ? (
              <Button loading={exporting} onClick={() => void exportPdf(viewing)}>
                Download PDF
              </Button>
            ) : null}
          </>
        }
      >
        {viewing ? (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 p-4 font-mono text-xs leading-relaxed">
            {viewing.content_markdown}
          </pre>
        ) : null}
      </Modal>
    </div>
  );
}
