"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseRoutingWorkbook, type ParseProgress } from "@/lib/excel-parser";
import { importRoutingWorkbook, type RoutingImportProgress } from "@/lib/routing-import-client";
import type { ParsedRoutingWorkbook, ParserConfigBundle, ParserSourceProfile } from "@/lib/types";
import { apiJson } from "@/lib/api-client";

type BootstrapResponse = { sources: { PLANNING: ParserSourceProfile; SCHEDULING: ParserSourceProfile; ROUTING: ParserSourceProfile }; settings: Record<string, unknown> };

export function RoutingImportConsole() {
  const [parsed, setParsed] = useState<ParsedRoutingWorkbook | null>(null);
  const [sha256, setSha256] = useState("");
  const [busy, setBusy] = useState(false);
  const [parseProgress, setParseProgress] = useState<ParseProgress | null>(null);
  const [progress, setProgress] = useState<RoutingImportProgress | null>(null);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [validation, setValidation] = useState<Record<string, unknown> | null>(null);
  const [parserConfig, setParserConfig] = useState<ParserConfigBundle | undefined>();
  const [maxChunkRows, setMaxChunkRows] = useState(80);

  useEffect(() => {
    apiJson<BootstrapResponse>("/api/config/bootstrap", { cache: "no-store" })
      .then((data) => { setParserConfig({ planning: data.sources.PLANNING, scheduling: data.sources.SCHEDULING, routing: data.sources.ROUTING }); setMaxChunkRows(Number(data.settings?.["import.maxRoutingChunkRows"] || 80)); })
      .catch(() => undefined);
  }, []);

  async function chooseFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setParsed(null);
    setSha256("");
    setError("");
    setComplete(false);
    setValidation(null);
    setProgress(null);
    setParseProgress({ stage: "READING", percent: 0 });

    try {
      let activeConfig = parserConfig;
      try {
        const data = await apiJson<BootstrapResponse>("/api/config/bootstrap", { cache: "no-store" });
        activeConfig = { planning: data.sources.PLANNING, scheduling: data.sources.SCHEDULING, routing: data.sources.ROUTING };
        setParserConfig(activeConfig);
        setMaxChunkRows(Number(data.settings?.["import.maxRoutingChunkRows"] || 80));
      } catch { /* parser has safe baseline fallback */ }
      const result = await parseRoutingWorkbook(file, setParseProgress, activeConfig);
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
    setValidation(null);
    try {
      const result = await importRoutingWorkbook(parsed, sha256, setProgress, maxChunkRows);
      setValidation(result.validation as Record<string, unknown>);
      setComplete(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const parsingActive = busy && parseProgress && !progress;
  const parseStageLabel = parseProgress?.stage === "READING"
    ? "Reading routing workbook"
    : parseProgress?.stage === "LOCATING"
      ? "Locating routing worksheet"
      : parseProgress?.stage === "UNPACKING"
        ? `Unpacking ${parseProgress.sheet ?? parseProgress.detail ?? "routing data"}`
        : parseProgress?.stage === "HASHING"
          ? "Verifying routing workbook fingerprint"
          : parseProgress?.stage === "COMPLETE"
            ? "Routing workbook ready"
            : `Parsing ${parseProgress?.sheet ?? "All Open Jobs route data"}`;

  return (
    <div className="stack">
      <section className="panel intake-panel routing-intake">
        <div className="panel-head">
          <div><span className="eyebrow">AUTHORITATIVE JOB ROUTING</span><h2>All Open Jobs Route Intake</h2></div>
          <span className="badge routing">CONFIG-DRIVEN ROUTING</span>
        </div>
        <div className="intake-grid">
          <label className="file-zone route-zone">
            <input type="file" accept=".xlsx,.xlsm" disabled={busy} onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
            <strong>{parsed?.filename ?? (busy ? "Reading routing workbook…" : "Select All Open Jobs workbook")}</strong>
            <span>Imports the configured full per-Job route: operation + completion + sequence + open nonconformance fields.</span>
          </label>
          <div className="policy-box routing-policy">
            <div><span>ROUTE GRAIN</span><strong>JOBNUM</strong></div>
            <div><span>SEQUENCE SOURCE</span><strong>OPRSEQ.1…36</strong></div>
            <div><span>CURRENT SOURCE</span><strong>NEXTOPERATION</strong></div>
          </div>
        </div>
      </section>

      {parsingActive ? (
        <section className="panel progress-panel">
          <div className="progress-head"><strong>{parseStageLabel}</strong><span>{parseProgress.percent}%</span></div>
          <div className="progress-track"><div style={{ width: `${parseProgress.percent}%` }} /></div>
          <p>The route workbook is decoded in a background worker and only the route worksheet XML is parsed.</p>
        </section>
      ) : null}

      {parsed ? (
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">ROUTE SOURCE VALIDATION</span><h2>{parsed.sheet.name}</h2></div></div>
          <div className="sheet-cards one-card">
            <div className="sheet-card routing-card">
              <span>ROUTING SOURCE</span>
              <h3>{parsed.filename}</h3>
              <div className="metric-row">
                <div><small>JOBS</small><strong>{Math.max(0, parsed.sheet.totalRows - 1).toLocaleString()}</strong></div>
                <div><small>COLUMNS</small><strong>{parsed.sheet.totalColumns}</strong></div>
                <div><small>ROUTE SLOTS</small><strong>{parserConfig?.routing.operationSlots ?? 36}</strong></div>
              </div>
            </div>
          </div>
          <div className="command-bar">
            <button className="button primary" disabled={busy} onClick={runImport}>{busy ? "Processing…" : "Commit Routing to Aiven"}</button>
            <span className="hash">SHA-256 {sha256.slice(0, 18)}…</span>
          </div>
        </section>
      ) : null}

      {progress ? (
        <section className="panel progress-panel">
          <div className="progress-head"><strong>{progress.stage}</strong><span>{progress.percent}%</span></div>
          <div className="progress-track"><div style={{ width: `${progress.percent}%` }} /></div>
          <p>{progress.sentRows.toLocaleString()} / {progress.totalRows.toLocaleString()} routing source rows transferred</p>
        </section>
      ) : null}

      {error ? <div className="alert error"><strong>Routing import failed</strong><span>{error}</span></div> : null}
      {complete ? (
        <div className="alert success route-success">
          <strong>Routing source imported and activated.</strong>
          <span>
            {validation?.jobRoutes ? `${Number(validation.jobRoutes).toLocaleString()} Jobs` : "Jobs validated"}
            {validation?.operationRows ? ` · ${Number(validation.operationRows).toLocaleString()} operation rows` : ""}
            {validation?.nextOperationCoverage != null ? ` · NextOperation coverage ${validation.nextOperationCoverage}%` : ""}
          </span>
          <Link href="/routing">Open Job Routing</Link>
        </div>
      ) : null}
    </div>
  );
}
