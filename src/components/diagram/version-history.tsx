"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, EmptyState, Modal } from "@/components/ui";
import { deleteVersionAction, restoreVersionAction } from "@/app/actions/diagrams";
import { formatDateTime, relativeTime } from "@/lib/utils";
import type { Diagram, DiagramVersion } from "@/lib/types";

export function VersionHistory({
  projectId,
  diagram,
  canEdit,
  onClose,
}: {
  projectId: string;
  diagram: Diagram;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [versions, setVersions] = React.useState<DiagramVersion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("diagram_versions")
        .select("id, diagram_id, version, nodes, edges, viewport, notes, created_by, created_at")
        .eq("diagram_id", diagram.id)
        .order("version", { ascending: false });

      if (queryError) {
        setError(queryError.message);
      } else {
        setVersions((data ?? []) as DiagramVersion[]);
        setError("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load version history.");
    } finally {
      setLoading(false);
    }
  }, [diagram.id]);

  // This component is only mounted once the user opens the history modal, so
  // loading here is user-initiated. Every setState in load() runs after the
  // awaited query, so there is no synchronous render loop; the rule cannot see
  // that across the await.
  React.useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  const restore = async (version: DiagramVersion) => {
    setBusyId(version.id);
    setError("");
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("diagramId", diagram.id);
    form.set("versionId", version.id);
    const result = await restoreVersionAction({ status: "idle", message: "" }, form);
    setBusyId(null);

    if (result.status === "error") {
      setError(result.message);
      return;
    }
    await load();
    router.refresh();
  };

  const remove = async (version: DiagramVersion) => {
    setBusyId(version.id);
    setError("");
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("diagramId", diagram.id);
    form.set("versionId", version.id);
    const result = await deleteVersionAction(form);
    setBusyId(null);

    if (result.status === "error") {
      setError(result.message);
      return;
    }
    await load();
    router.refresh();
  };

  const head = versions[0]?.version ?? diagram.current_version;

  return (
    <Modal open onClose={onClose} title={`Version history — ${diagram.name}`} size="lg">
      <div className="space-y-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {loading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading versions…</p>
        ) : versions.length === 0 ? (
          <EmptyState
            icon="🕘"
            title="No saved versions"
            description="Save a version from the canvas to start a history you can roll back to."
          />
        ) : (
          <ul className="space-y-2">
            {versions.map((version) => {
              const nodeCount = Array.isArray(version.nodes) ? version.nodes.length : 0;
              const edgeCount = Array.isArray(version.edges) ? version.edges.length : 0;
              const isCurrent = version.version === head;
              const isOnly = versions.length <= 1;

              return (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <Badge tone={isCurrent ? "success" : "muted"}>v{version.version}</Badge>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {version.notes || "No release note"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground" title={formatDateTime(version.created_at)}>
                      {nodeCount} components, {edgeCount} connections · {relativeTime(version.created_at)}
                    </p>
                  </div>

                  {isCurrent ? (
                    <span className="text-[10px] font-medium text-success">Current</span>
                  ) : canEdit ? (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busyId === version.id}
                      onClick={() => void restore(version)}
                    >
                      Restore
                    </Button>
                  ) : null}

                  {canEdit && !isOnly ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      disabled={busyId === version.id}
                      onClick={() => void remove(version)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Restoring copies an older version into a new head version, so nothing is ever lost. The last
          remaining version cannot be deleted.
        </p>
      </div>
    </Modal>
  );
}
