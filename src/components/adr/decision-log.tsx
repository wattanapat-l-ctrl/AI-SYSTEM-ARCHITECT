"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteAdrAction, saveAdrAction } from "@/app/actions/planning";
import { ADR_STATUSES } from "@/lib/constants";
import { IDLE, formatDate, type ActionState } from "@/lib/utils";
import type { Adr, AdrStatus } from "@/lib/types";
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
  Tabs,
  Textarea,
} from "@/components/ui";

const STATUS_TONE: Record<AdrStatus, "info" | "success" | "danger" | "muted"> = {
  proposed: "info",
  accepted: "success",
  rejected: "danger",
  superseded: "muted",
};

function AdrDialog({
  projectId,
  adr,
  nextNumber,
  open,
  onClose,
}: {
  projectId: string;
  adr: Adr | null;
  nextNumber: number;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(adr);
  const [state, formAction, isPending] = React.useActionState<ActionState, FormData>(
    saveAdrAction,
    IDLE,
  );
  const lastHandled = React.useRef("");

  const [title, setTitle] = React.useState(adr?.title ?? "");
  const [status, setStatus] = React.useState<AdrStatus>(adr?.status ?? "proposed");
  const [context, setContext] = React.useState(adr?.context ?? "");
  const [decision, setDecision] = React.useState(adr?.decision ?? "");
  const [consequences, setConsequences] = React.useState(adr?.consequences ?? "");
  const [alternatives, setAlternatives] = React.useState(adr?.alternatives ?? "");
  const [tags, setTags] = React.useState((adr?.tags ?? []).join(", "));

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
      title={isEdit ? `ADR-${adr?.number}: edit` : `New ADR-${nextNumber}`}
      description="Record the context, the decision and what it costs you later."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="adr-form" loading={isPending}>
            {isEdit ? "Save decision" : "Create decision"}
          </Button>
        </>
      }
    >
      <form id="adr-form" action={formAction} className="space-y-3.5">
        <input type="hidden" name="projectId" value={projectId} />
        {adr ? <input type="hidden" name="adrId" value={adr.id} /> : null}

        {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

        <div className="grid gap-3.5 sm:grid-cols-[1fr_10rem]">
          <Field
            label="Title"
            htmlFor="adr-title"
            required
            error={state.fieldErrors?.title}
          >
            <Input
              id="adr-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Use PostgreSQL instead of DynamoDB"
              required
              maxLength={300}
            />
          </Field>

          <Field label="Status" htmlFor="adr-status">
            <Select
              id="adr-status"
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AdrStatus)}
            >
              {ADR_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Context"
          htmlFor="adr-context"
          hint="What problem are we solving?"
        >
          <Textarea
            id="adr-context"
            name="context"
            rows={3}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Requirements, constraints, and the forces at play."
          />
        </Field>

        <Field label="Decision" htmlFor="adr-decision" hint="What did we choose?">
          <Textarea
            id="adr-decision"
            name="decision"
            rows={3}
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            placeholder="The chosen approach, stated plainly."
          />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Consequences" htmlFor="adr-consequences" hint="Good and bad.">
            <Textarea
              id="adr-consequences"
              name="consequences"
              rows={3}
              value={consequences}
              onChange={(e) => setConsequences(e.target.value)}
            />
          </Field>

          <Field label="Alternatives" htmlFor="adr-alternatives" hint="And why not those?">
            <Textarea
              id="adr-alternatives"
              name="alternatives"
              rows={3}
              value={alternatives}
              onChange={(e) => setAlternatives(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Tags" htmlFor="adr-tags" hint="Comma separated">
          <Input
            id="adr-tags"
            name="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="database, cost, latency"
          />
        </Field>
      </form>
    </Modal>
  );
}

function AdrCard({
  adr,
  canEdit,
  onEdit,
}: {
  adr: Adr;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState("");

  return (
    <Card>
      <CardContent className="space-y-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">ADR-{adr.number}</span>
              <Badge tone={STATUS_TONE[adr.status]}>{adr.status}</Badge>
            </div>
            <h3 className="mt-1 font-medium">{adr.title}</h3>
          </div>

          {canEdit ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Less" : "Details"}
              </Button>
              <Button size="sm" variant="ghost" onClick={onEdit}>
                Edit
              </Button>
              {confirming ? (
                <>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("projectId", adr.project_id);
                      fd.set("adrId", adr.id);
                      void deleteAdrAction(fd).then((result) => {
                        if (result.status === "error") setError(result.message);
                        else router.refresh();
                      });
                    }}
                  >
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirming(true)}
                >
                  Delete
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {!expanded ? (
          adr.decision ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{adr.decision}</p>
          ) : null
        ) : (
          <dl className="space-y-2.5 text-sm">
            {(
              [
                ["Context", adr.context],
                ["Decision", adr.decision],
                ["Consequences", adr.consequences],
                ["Alternatives", adr.alternatives],
              ] as const
            )
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap leading-relaxed">{value}</dd>
                </div>
              ))}
          </dl>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {adr.tags.map((tag) => (
            <Badge key={tag} tone="muted">
              {tag}
            </Badge>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatDate(adr.created_at)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function DecisionLog({
  projectId,
  adrs,
  canEdit,
}: {
  projectId: string;
  adrs: Adr[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Adr | null>(null);
  const [filter, setFilter] = React.useState<AdrStatus | "all">("all");
  const [query, setQuery] = React.useState("");

  const nextNumber = (adrs[0]?.number ?? 0) + 1;

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return adrs.filter((adr) => {
      if (filter !== "all" && adr.status !== filter) return false;
      if (!needle) return true;
      return (
        adr.title.toLowerCase().includes(needle) ||
        adr.decision.toLowerCase().includes(needle) ||
        adr.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [adrs, filter, query]);

  const counts = React.useMemo(() => {
    const map = new Map<AdrStatus, number>();
    for (const adr of adrs) map.set(adr.status, (map.get(adr.status) ?? 0) + 1);
    return map;
  }, [adrs]);

  return (
    <div className="space-y-4">
      {adrs.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search decisions…"
            className="h-8 max-w-xs text-xs"
            aria-label="Search decisions"
          />
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: "all", label: "All", badge: adrs.length },
              ...ADR_STATUSES.map((s) => ({
                id: s.id,
                label: s.label,
                badge: counts.get(s.id) ?? 0,
              })),
            ]}
          />
          {canEdit ? (
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              New decision
            </Button>
          ) : null}
        </div>
      ) : null}

      {adrs.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="\u{1F4DD}"
              title="No decisions recorded"
              description="Capture the reasoning behind your architecture so the next person understands why it looks like this."
              action={
                canEdit ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(null);
                      setDialogOpen(true);
                    }}
                  >
                    Record the first decision
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Alert tone="info">No decisions match this filter.</Alert>
      ) : (
        <div className="space-y-3">
          {visible.map((adr) => (
            <AdrCard
              key={adr.id}
              adr={adr}
              canEdit={canEdit}
              onEdit={() => {
                setEditing(adr);
                setDialogOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <AdrDialog
        key={editing?.id ?? "new"}
        projectId={projectId}
        adr={editing}
        nextNumber={nextNumber}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );
}
