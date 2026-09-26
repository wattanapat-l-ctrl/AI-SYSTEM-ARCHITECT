"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { deleteReviewAction, runArchitectureReviewAction } from "@/app/actions/review";
import { IDLE, formatDateTime, relativeTime, type ActionState } from "@/lib/utils";
import type { AiReview, Diagram, ReviewFinding, ReviewSeverity } from "@/lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  Select,
  Stat,
} from "@/components/ui";

const SEVERITY_TONE: Record<ReviewSeverity, "danger" | "warning" | "info" | "muted" | "primary"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
  info: "muted",
};

const SEVERITY_ORDER: ReviewSeverity[] = ["critical", "high", "medium", "low", "info"];

function scoreTone(score: number): "success" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

function FindingRow({ finding }: { finding: ReviewFinding }) {
  return (
    <li className="rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
        <span className="font-medium">{finding.title}</span>
        {finding.category ? (
          <span className="text-xs text-muted-foreground">{finding.category}</span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{finding.detail}</p>
      {finding.suggestion ? (
        <p className="mt-1.5 text-sm leading-relaxed">
          <span className="font-medium">Suggested change: </span>
          {finding.suggestion}
        </p>
      ) : null}
    </li>
  );
}

function ReviewDetail({ review }: { review: AiReview }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState("");

  const findings = [...(review.findings ?? [])].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  const bySeverity = SEVERITY_ORDER.map((severity) => ({
    severity,
    count: findings.filter((f) => f.severity === severity).length,
  })).filter((row) => row.count > 0);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            Architecture score
            <Badge tone={scoreTone(review.score)}>{review.score}/100</Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {review.engine === "llm" ? `Model: ${review.model}` : "Offline rules engine"} ·{" "}
            {formatDateTime(review.created_at)} ({relativeTime(review.created_at)})
          </p>
        </div>
        {confirming ? (
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                const fd = new FormData();
                fd.set("projectId", review.project_id);
                fd.set("reviewId", review.id);
                void deleteReviewAction(fd).then((result) => {
                  if (result.status === "error") {
                    setError(result.message);
                    return;
                  }
                  setError("");
                  router.refresh();
                });
              }}
            >
              Confirm delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-destructive hover:bg-destructive/10"
            onClick={() => setConfirming(true)}
          >
            Delete
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Progress value={review.score} tone={scoreTone(review.score)} />

        {review.summary ? (
          <p className="text-sm leading-relaxed">{review.summary}</p>
        ) : null}

        {bySeverity.length ? (
          <div className="flex flex-wrap gap-1.5">
            {bySeverity.map((row) => (
              <Badge key={row.severity} tone={SEVERITY_TONE[row.severity]}>
                {row.count} {row.severity}
              </Badge>
            ))}
          </div>
        ) : null}

        {findings.length ? (
          <ul className="space-y-2">
            {findings.map((finding, i) => (
              <FindingRow key={`${finding.title}-${i}`} finding={finding} />
            ))}
          </ul>
        ) : (
          <Alert tone="success">No issues were reported.</Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewWorkspace({
  projectId,
  diagrams,
  reviews,
  canEdit,
  llmConfigured,
}: {
  projectId: string;
  diagrams: Diagram[];
  reviews: AiReview[];
  canEdit: boolean;
  llmConfigured: boolean;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = React.useActionState<ActionState, FormData>(
    runArchitectureReviewAction,
    IDLE,
  );
  const [scope, setScope] = React.useState("all");
  const [openId, setOpenId] = React.useState<string | null>(reviews[0]?.id ?? null);
  const lastRefreshed = React.useRef("");

  const latest = reviews[0] ?? null;
  const open = reviews.find((r) => r.id === openId) ?? null;

  // Refresh once per completed run; the ref guard stops a changing state
  // identity from re-triggering the refresh.
  React.useEffect(() => {
    if (state.status !== "success") return;
    if (lastRefreshed.current === state.message) return;
    lastRefreshed.current = state.message;
    router.refresh();
  }, [state, router]);

  const critical = latest
    ? (latest.findings ?? []).filter((f) => f.severity === "critical" || f.severity === "high")
        .length
    : 0;

  return (
    <div className="space-y-4">
      {llmConfigured ? null : (
        <Alert tone="info" title="Running the offline rules engine">
          Set <code className="font-mono">OPENAI_API_KEY</code> to get model-based reviews. The rules
          engine still covers the common structural, reliability and security checks.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Latest score"
          value={latest ? `${latest.score}/100` : "—"}
          hint={latest ? relativeTime(latest.created_at) : "No review yet"}
          tone={latest ? scoreTone(latest.score) : undefined}
        />
        <Stat
          label="High severity findings"
          value={latest ? String(critical) : "—"}
          hint="Critical and high"
          tone={critical > 0 ? "danger" : undefined}
        />
        <Stat label="Reviews stored" value={String(reviews.length)} hint="Kept for comparison" />
      </div>

      {canEdit ? (
        <Card>
          <CardContent>
            <form action={formAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="diagramId" value={scope === "all" ? "" : scope} />

              <div className="min-w-56 flex-1 space-y-1.5">
                <label htmlFor="review-scope" className="block text-xs font-medium text-muted-foreground">
                  Scope
                </label>
                <Select
                  id="review-scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="all">Whole project (all diagrams)</option>
                  {diagrams.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>

              <Button type="submit" loading={isPending}>
                Run review
              </Button>
            </form>

            {state.status === "error" ? (
              <Alert tone="danger" className="mt-3">
                {state.message}
              </Alert>
            ) : null}
            {state.status === "success" ? (
              <Alert tone="success" className="mt-3">
                {state.message}
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {reviews.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="\u{1F916}"
              title="No reviews yet"
              description={
                canEdit
                  ? "Run a review to get a scored assessment of scalability, reliability, security and operability."
                  : "Reviews will appear here once a teammate runs one."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {reviews.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {reviews.map((review) => (
                <Button
                  key={review.id}
                  size="sm"
                  variant={review.id === openId ? "secondary" : "ghost"}
                  onClick={() => setOpenId(review.id)}
                >
                  {review.score}/100 · {relativeTime(review.created_at)}
                </Button>
              ))}
            </div>
          ) : null}

          {open ? <ReviewDetail review={open} /> : null}
        </>
      )}
    </div>
  );
}
