"use client";

import { useMemo, useState } from "react";
import type {
  CombinedTimelineModel,
  TimelineItem,
  TimelineState,
} from "../../lib/st-output-v025/types";

const STATE_LABEL: Record<TimelineState, string> = {
  DONE: "Done",
  IN_PROGRESS: "In progress",
  EXISTING_SCHEDULED: "Existing scheduled",
  EXISTING_UNSCHEDULED: "Existing unscheduled",
  PROPOSED_EXISTING_BATCH: "Existing batch / proposed slot",
  PROPOSED_NEW_BATCH: "Proposed new batch",
  OUTAGE: "Resource down",
  FINAL_GATE: "Final inspection",
  CONFLICT: "Conflict",
};

const STATE_CLASS: Record<TimelineState, string> = {
  DONE: "bg-slate-500 text-white border-slate-600",
  IN_PROGRESS: "bg-blue-600 text-white border-blue-700",
  EXISTING_SCHEDULED: "bg-emerald-600 text-white border-emerald-700",
  EXISTING_UNSCHEDULED: "bg-slate-100 text-slate-800 border-dashed border-slate-400",
  PROPOSED_EXISTING_BATCH: "bg-amber-100 text-amber-950 border-dashed border-amber-500",
  PROPOSED_NEW_BATCH: "bg-violet-100 text-violet-950 border-dashed border-violet-500",
  OUTAGE: "bg-rose-100 text-rose-950 border-rose-500",
  FINAL_GATE: "bg-transparent text-fuchsia-700 border-fuchsia-500",
  CONFLICT: "bg-red-600 text-white border-red-800",
};

const VISIBLE_STATES: TimelineState[] = [
  "DONE",
  "IN_PROGRESS",
  "EXISTING_SCHEDULED",
  "PROPOSED_EXISTING_BATCH",
  "PROPOSED_NEW_BATCH",
  "OUTAGE",
  "FINAL_GATE",
  "CONFLICT",
];

function dt(value: string) {
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function num(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value);
}

function blockTitle(item: TimelineItem) {
  const batch = item.batchNo || item.mainOperation || item.operationCode || item.state;
  return item.phase === "NORMAL" ? batch : `${batch} · ${item.phase}`;
}

export function CombinedProductionTimeline({
  model,
  cutoff,
  now = new Date().toISOString(),
}: {
  model: CombinedTimelineModel;
  cutoff?: string | null;
  now?: string;
}) {
  const [selected, setSelected] = useState<TimelineItem | null>(null);
  const [states, setStates] = useState<Set<TimelineState>>(
    () => new Set(VISIBLE_STATES)
  );

  const startMs = dt(model.horizonStart);
  const endMs = dt(model.horizonEnd);
  const span = Math.max(1, endMs - startMs);

  const byLane = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const item of model.items) {
      if (!states.has(item.state)) continue;
      const key = `${item.resourceType}|${item.resourceCode}`;
      const rows = map.get(key) || [];
      rows.push(item);
      map.set(key, rows);
    }
    return map;
  }, [model.items, states]);

  const hours = useMemo(() => {
    const rows: number[] = [];
    const first = new Date(startMs);
    first.setMinutes(0, 0, 0);
    let cursor = first.getTime();
    if (cursor < startMs) cursor += 60 * 60 * 1000;
    while (cursor <= endMs) {
      rows.push(cursor);
      cursor += 2 * 60 * 60 * 1000;
    }
    return rows;
  }, [startMs, endMs]);

  const pos = (value: string) => ((dt(value) - startMs) / span) * 100;
  const width = (item: TimelineItem) =>
    Math.max(0.25, ((dt(item.end) - dt(item.start)) / span) * 100);

  const toggleState = (state: TimelineState) => {
    setStates((previous) => {
      const next = new Set(previous);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  };

  const summary = model.outputSummary;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Target" value={`${num(summary.targetDm2)} dm²`} />
        <Kpi label="Reached Final" value={`${num(summary.alreadyReachedFinalDm2)} dm²`} />
        <Kpi label="Existing forecast" value={`${num(summary.existingPlanForecastDm2)} dm²`} />
        <Kpi label="Proposed additional" value={`${num(summary.proposedAdditionalDm2)} dm²`} />
        <Kpi label="Total forecast" value={`${num(summary.totalForecastDm2)} dm²`} />
        <Kpi
          label="Gap"
          value={`${summary.gapDm2 >= 0 ? "+" : ""}${num(summary.gapDm2)} dm²`}
          strong
        />
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-3">
        {VISIBLE_STATES.map((state) => (
          <button
            key={state}
            type="button"
            onClick={() => toggleState(state)}
            className={`rounded border px-2 py-1 text-xs font-medium ${
              states.has(state) ? STATE_CLASS[state] : "bg-white text-slate-400 border-slate-200"
            }`}
          >
            {STATE_LABEL[state]}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="grid grid-cols-[160px_minmax(900px,1fr)] border-b bg-slate-50">
          <div className="border-r p-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Resource
          </div>
          <div className="relative h-12">
            {hours.map((hour) => {
              const left = ((hour - startMs) / span) * 100;
              return (
                <div
                  key={hour}
                  className="absolute inset-y-0 border-l border-slate-200"
                  style={{ left: `${left}%` }}
                >
                  <span className="absolute left-1 top-1 whitespace-nowrap text-[10px] text-slate-500">
                    {new Intl.DateTimeFormat("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    }).format(new Date(hour))}
                  </span>
                </div>
              );
            })}
            {cutoff && dt(cutoff) >= startMs && dt(cutoff) <= endMs ? (
              <Marker left={pos(cutoff)} label="CUTOFF" className="border-fuchsia-500 text-fuchsia-700" />
            ) : null}
            {dt(now) >= startMs && dt(now) <= endMs ? (
              <Marker left={pos(now)} label="NOW" className="border-sky-500 text-sky-700" />
            ) : null}
          </div>
        </div>

        <div className="max-h-[660px] overflow-auto">
          {model.lanes.map((lane: CombinedTimelineModel["lanes"][number]) => {
            const key = `${lane.resourceType}|${lane.resourceCode}`;
            const items = byLane.get(key) || [];
            return (
              <div key={key} className="grid min-h-14 grid-cols-[160px_minmax(900px,1fr)] border-b last:border-b-0">
                <div className="border-r bg-slate-50/60 p-3">
                  <div className="text-sm font-semibold text-slate-800">{lane.label}</div>
                  <div className="text-[10px] text-slate-500">{lane.resourceType}</div>
                </div>
                <div className="relative min-h-14">
                  {hours.map((hour) => {
                    const left = ((hour - startMs) / span) * 100;
                    return (
                      <div
                        key={hour}
                        className="pointer-events-none absolute inset-y-0 border-l border-slate-100"
                        style={{ left: `${left}%` }}
                      />
                    );
                  })}
                  {cutoff && dt(cutoff) >= startMs && dt(cutoff) <= endMs ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 border-l border-fuchsia-300"
                      style={{ left: `${pos(cutoff)}%` }}
                    />
                  ) : null}
                  {items.map((item, index) => {
                    if (item.state === "FINAL_GATE" || dt(item.end) === dt(item.start)) {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelected(item)}
                          title={`${blockTitle(item)} · ${fmt(item.start)}`}
                          className="absolute top-1 bottom-1 z-20 border-l-2 border-fuchsia-600"
                          style={{ left: `${pos(item.start)}%` }}
                        >
                          <span className="absolute left-1 top-0 whitespace-nowrap rounded bg-white px-1 text-[9px] font-semibold text-fuchsia-700 shadow-sm">
                            {item.operationCode || "FINAL"}
                          </span>
                        </button>
                      );
                    }

                    const top = 5 + (index % 2) * 23;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelected(item)}
                        className={`absolute z-10 overflow-hidden rounded border px-1 text-left text-[10px] shadow-sm ${STATE_CLASS[item.state]}`}
                        style={{
                          left: `${Math.max(0, pos(item.start))}%`,
                          width: `${Math.min(100, width(item))}%`,
                          top,
                          height: 20,
                        }}
                        title={`${STATE_LABEL[item.state]} · ${blockTitle(item)} · ${fmt(item.start)} → ${fmt(item.end)}`}
                      >
                        <span className="block truncate font-semibold">{blockTitle(item)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Timeline detail
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {selected.batchNo || selected.mainOperation || selected.operationCode || selected.state}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded border px-2 py-1 text-xs text-slate-600"
            >
              Đóng
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="State" value={STATE_LABEL[selected.state]} />
            <Detail label="Main Operation" value={selected.mainOperation || "—"} />
            <Detail label="Resource" value={selected.resourceCode} />
            <Detail label="Phase" value={selected.phase} />
            <Detail label="Start" value={fmt(selected.start)} />
            <Detail label="End" value={fmt(selected.end)} />
            <Detail label="Jobs" value={String(selected.jobNums.length)} />
            <Detail label="Surface" value={selected.surfaceDm2 == null ? "—" : `${num(selected.surfaceDm2)} dm²`} />
          </div>
          {selected.conflictCode ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <b>{selected.conflictCode}</b>
              {selected.conflictDetail ? ` · ${selected.conflictDetail}` : ""}
            </div>
          ) : null}
          {selected.jobNums.length ? (
            <div className="mt-4 text-xs text-slate-600">
              <b>Jobs:</b> {selected.jobNums.join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-3 ${strong ? "ring-1 ring-slate-300" : ""}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm text-slate-800">{value}</div>
    </div>
  );
}

function Marker({ left, label, className }: { left: number; label: string; className: string }) {
  return (
    <div className={`pointer-events-none absolute inset-y-0 z-30 border-l-2 ${className}`} style={{ left: `${left}%` }}>
      <span className="absolute left-1 top-7 whitespace-nowrap rounded bg-white px-1 text-[9px] font-bold shadow-sm">
        {label}
      </span>
    </div>
  );
}
