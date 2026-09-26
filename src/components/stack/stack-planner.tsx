"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  deleteServiceSelectionAction,
  upsertServiceSelectionAction,
} from "@/app/actions/planning";
import { costInsights, computeCostBreakdown, monthlyForUnit } from "@/lib/cost";
import { SERVICE_CATEGORIES, UNIT_FACTORS } from "@/lib/constants";
import { IDLE, type ActionState } from "@/lib/utils";
import type { ServiceCatalogItem, ServiceSelection } from "@/lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Stat,
  Tabs,
  Textarea,
} from "@/components/ui";

function usd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 100 ? 2 : 0,
  });
}

function SelectionDialog({
  projectId,
  catalog,
  existing,
  open,
  onClose,
}: {
  projectId: string;
  catalog: ServiceCatalogItem[];
  existing: ServiceSelection | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(existing);
  const [state, formAction, isPending] = React.useActionState<ActionState, FormData>(
    upsertServiceSelectionAction,
    IDLE,
  );
  const lastHandled = React.useRef("");

  const [serviceId, setServiceId] = React.useState(existing?.service_id ?? "");
  const [quantity, setQuantity] = React.useState(String(existing?.quantity ?? "1"));
  const [notes, setNotes] = React.useState(existing?.notes ?? "");
  const [config, setConfig] = React.useState(
    existing?.config && Object.keys(existing.config).length
      ? JSON.stringify(existing.config, null, 2)
      : "",
  );

  React.useEffect(() => {
    if (state.status !== "success") return;
    if (lastHandled.current === state.message) return;
    lastHandled.current = state.message;
    onClose();
    router.refresh();
  }, [state, onClose, router]);

  const chosen = catalog.find((c) => c.id === serviceId) ?? null;
  const preview = chosen ? monthlyForUnit(chosen.unit, Number(chosen.unit_price_usd) || 0, Number(quantity) || 0) : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit selection" : "Add service"}
      description={isEdit ? undefined : "Pick a catalog service and size it for this project."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {/* Outside the <form>, so pending comes from useActionState, not useFormStatus. */}
          <Button type="submit" form="selection-form" loading={isPending}>
            {isEdit ? "Save changes" : "Add to stack"}
          </Button>
        </>
      }
    >
      <form id="selection-form" action={formAction} className="space-y-3.5">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="serviceId" value={serviceId} />

        {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

        <Field label="Service" htmlFor="sel-service" required>
          <Select
            id="sel-service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            disabled={isEdit}
          >
            <option value="">Select a service…</option>
            {SERVICE_CATEGORIES.map((category) => {
              const items = catalog.filter((c) => c.category === category.id);
              if (!items.length) return null;
              return (
                <optgroup key={category.id} label={category.label}>
                  {items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.vendor}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
        </Field>

        {chosen ? (
          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-xs">
            <p className="font-medium text-foreground">{chosen.name}</p>
            <p className="mt-1 text-muted-foreground">{chosen.description}</p>
            <p className="mt-1.5 text-muted-foreground">
              {usd(Number(chosen.unit_price_usd) || 0)} per {chosen.unit}
              {chosen.pricing_note ? ` · ${chosen.pricing_note}` : ""}
            </p>
          </div>
        ) : null}

        <Field
          label={`Quantity${chosen ? ` (${chosen.unit})` : ""}`}
          htmlFor="sel-qty"
          hint={chosen && UNIT_FACTORS[chosen.unit]?.hours ? "Billed monthly (hours × rate)." : undefined}
        >
          <Input
            id="sel-qty"
            name="quantity"
            type="number"
            min="0"
            step="0.0001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </Field>

        {chosen && preview > 0 ? (
          <p className="text-xs text-muted-foreground">
            Estimated monthly cost:{" "}
            <span className="font-semibold text-foreground">{usd(preview)}</span>
          </p>
        ) : null}

        <Field label="Config overrides (JSON)" htmlFor="sel-config" hint='e.g. {"region": "ap-southeast-1"}'>
          <Textarea
            id="sel-config"
            name="config"
            rows={3}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            placeholder="{ }"
            className="font-mono text-xs"
          />
        </Field>

        <Field label="Notes" htmlFor="sel-notes">
          <Textarea
            id="sel-notes"
            name="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this service, and any sizing assumptions"
          />
        </Field>
      </form>
    </Modal>
  );
}

function RemoveButton({ projectId, selectionId }: { projectId: string; selectionId: string }) {
  const [error, setError] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10"
        onClick={() => setConfirming(true)}
      >
        Remove
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      <Button
        size="sm"
        variant="danger"
        onClick={() => {
          const fd = new FormData();
          fd.set("projectId", projectId);
          fd.set("selectionId", selectionId);
          void deleteServiceSelectionAction(fd).then((result) => {
            if (result.status === "error") setError(result.message);
          });
        }}
      >
        Confirm
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function StackPlanner({
  projectId,
  catalog,
  selections,
  canEdit,
}: {
  projectId: string;
  catalog: ServiceCatalogItem[];
  selections: ServiceSelection[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ServiceSelection | null>(null);
  const [tab, setTab] = React.useState("breakdown");

  const catalogById = React.useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog],
  );
  const cost = React.useMemo(
    () => computeCostBreakdown(selections, catalogById),
    [selections, catalogById],
  );
  const insights = React.useMemo(() => costInsights(cost), [cost]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (selection: ServiceSelection) => {
    setEditing(selection);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Estimated monthly" value={usd(cost.monthlyTotal)} hint="From current selections" />
        <Stat label="Estimated annual" value={usd(cost.annualTotal)} hint="Monthly × 12" />
        <Stat
          label="Services selected"
          value={String(cost.lines.length)}
          hint={`${catalog.length} available in the catalog`}
        />
      </div>

      {insights.length ? (
        <Alert tone="info" title="Cost insights">
          <ul className="list-disc space-y-1 pl-4">
            {insights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Selected services</CardTitle>
          {canEdit ? (
            <Button size="sm" onClick={openNew}>
              Add service
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {selections.length === 0 ? (
            <EmptyState
              title="No services selected"
              description="Add the managed services this project depends on to build a cost model."
              action={
                canEdit ? (
                  <Button size="sm" onClick={openNew}>
                    Add the first service
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Service</th>
                    <th className="pb-2 pr-3 font-medium">Category</th>
                    <th className="pb-2 pr-3 text-right font-medium">Qty</th>
                    <th className="pb-2 pr-3 text-right font-medium">Unit price</th>
                    <th className="pb-2 pr-3 text-right font-medium">Monthly</th>
                    {canEdit ? <th className="pb-2 text-right font-medium">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {cost.lines.map((line) => {
                    const selection = selections.find((s) => s.id === line.selectionId);
                    return (
                      <tr key={line.selectionId} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 pr-3">
                          <p className="font-medium">{line.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.vendor}
                            {line.notes ? ` · ${line.notes}` : ""}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge tone="muted">{line.category}</Badge>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {line.quantity} {line.unit}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                          {usd(line.unitPrice)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-medium tabular-nums">
                          {usd(line.monthly)}
                        </td>
                        {canEdit ? (
                          <td className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(selection!)}>
                                Edit
                              </Button>
                              <RemoveButton projectId={projectId} selectionId={line.selectionId} />
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {cost.lines.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "breakdown", label: "By category" },
                { id: "drivers", label: "Top drivers" },
                { id: "assumptions", label: "Assumptions" },
              ]}
            />
            <div className="pt-4">
              {tab === "breakdown" ? (
                <div className="space-y-2.5">
                  {cost.byCategory.map((row) => (
                    <div key={row.category}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium capitalize">{row.category}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {usd(row.monthly)} · {(row.share * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(row.share * 100, 1)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === "drivers" ? (
                <ol className="space-y-2">
                  {cost.topDrivers.map((line, i) => (
                    <li key={line.selectionId} className="flex items-baseline gap-2 text-sm">
                      <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                      <span className="flex-1">{line.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {usd(line.monthly)}/mo
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}

              {tab === "assumptions" ? (
                <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {cost.assumptions.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <SelectionDialog
        key={editing?.id ?? "new"}
        projectId={projectId}
        catalog={catalog}
        existing={editing}
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
