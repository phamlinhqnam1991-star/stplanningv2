"use client";

import { useState } from "react";
import Link from "next/link";
import { parseWorkbook, type ParseProgress } from "@/lib/excel-parser";
import { importWorkbook, type ImportProgress } from "@/lib/import-client";
import type { ParsedWorkbook } from "@/lib/types";

export function ImportConsole() {
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [sha256, setSha256] = useState("");
  const [busy, setBusy] = useState(false);
  const [parseProgress, setParseProgress] = useState<ParseProgress | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  async function chooseFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setParsed(null);
    setSha256("");
    setError("");
    setComplete(false);
    setProgress(null);
    setParseProgress({ stage: "READING", percent: 0 });

    try {
      const result = await parseWorkbook(file, setParseProgress);
      setParsed(result.workbook);
      setSha256(result.sha256);
    } catch (e) {
      setParsed(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!parsed || !sha256) return;
    setBusy(true);
    setError("");
    setComplete(false);
    try {
      await importWorkbook(parsed, sha256, setProgress);
      setComplete(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const parsingActive = busy && parseProgress && !progress;

  const parseStageLabel = parseProgress?.stage === "READING"
    ? "Reading workbook"
    : parseProgress?.stage === "LOCATING"
      ? "Locating workbook data"
      : parseProgress?.stage === "UNPACKING"
        ? `Unpacking ${parseProgress.sheet ?? parseProgress.detail ?? "workbook data"}`
        : parseProgress?.stage === "HASHING"
          ? "Verifying workbook fingerprint"
          : parseProgress?.stage === "COMPLETE"
            ? "Workbook ready"
            : `Parsing ${parseProgress?.sheet ?? "source data"}`;

  return (
    <div className="stack">
      <section className="panel intake-panel">
        <div className="panel-head">
          <div><span className="eyebrow">CONTROLLED SOURCE</span><h2>Workbook Intake</h2></div>
          <span className="badge neutral">2 SHEETS ONLY</span>
        </div>
        <div className="intake-grid">
          <label className="file-zone">
            <input type="file" accept=".xlsx,.xlsm" disabled={busy} onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
            <strong>{parsed?.filename ?? (busy ? "Reading workbook…" : "Select ST workbook")}</strong>
            <span>Browser parsing preserves the complete used range while keeping the page responsive.</span>
          </label>
          <div className="policy-box">
            <div><span>RAW RETENTION</span><strong>100%</strong></div>
            <div><span>NORMALIZATION</span><strong>APPROVED CORE ONLY</strong></div>
            <div><span>BUSINESS LOGIC</span><strong>NOT APPLIED</strong></div>
          </div>
        </div>
      </section>

      {parsingActive ? (
        <section className="panel progress-panel">
          <div className="progress-head">
            <strong>{parseStageLabel}</strong>
            <span>{parseProgress.percent}%</span>
          </div>
          <div className="progress-track"><div style={{ width: `${parseProgress.percent}%` }} /></div>
          <p>The importer reads only the two controlled worksheet XML parts in a background worker. It does not decode unrelated sheets, styles, or workbook objects.</p>
        </section>
      ) : null}

      {parsed ? (
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">VALIDATION PREVIEW</span><h2>Source Structure</h2></div></div>
          <div className="sheet-cards">
            {parsed.sheets.map((sheet) => (
              <div className="sheet-card" key={sheet.key}>
                <span>{sheet.key === "planning" ? "PLAN SOURCE" : "SCHEDULE SOURCE"}</span>
                <h3>{sheet.name}</h3>
                <div className="metric-row"><div><small>ROWS</small><strong>{sheet.totalRows.toLocaleString()}</strong></div><div><small>COLUMNS</small><strong>{sheet.totalColumns}</strong></div><div><small>HEADER ROWS</small><strong>{sheet.headerRows}</strong></div></div>
              </div>
            ))}
          </div>
          <div className="command-bar">
            <button className="button primary" disabled={busy} onClick={runImport}>{busy ? "Processing…" : "Commit to Aiven"}</button>
            <span className="hash">SHA-256 {sha256.slice(0, 18)}…</span>
          </div>
        </section>
      ) : null}

      {progress ? (
        <section className="panel progress-panel">
          <div className="progress-head"><strong>{progress.stage}</strong><span>{progress.percent}%</span></div>
          <div className="progress-track"><div style={{ width: `${progress.percent}%` }} /></div>
          <p>{progress.sheet ? `${progress.sheet} — ` : ""}{progress.sentRows.toLocaleString()} / {progress.totalRows.toLocaleString()} source rows transferred</p>
        </section>
      ) : null}

      {error ? <div className="alert error"><strong>Import failed</strong><span>{error}</span></div> : null}
      {complete ? <div className="alert success"><strong>Import completed and validated.</strong><span>The snapshot is now active.</span><Link href="/planning">Open Planning</Link></div> : null}
    </div>
  );
}
