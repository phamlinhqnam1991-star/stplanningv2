"use client";

import type { ParsedRoutingWorkbook, ParsedWorkbook } from "@/lib/types";

export type ParseProgress = {
  stage: "READING" | "LOCATING" | "UNPACKING" | "PARSING" | "HASHING" | "COMPLETE";
  sheet?: string;
  detail?: string;
  percent: number;
};

type WorkerProgressMessage = {
  type: "PROGRESS";
  progress: ParseProgress;
};

type WorkerDoneMessage = {
  type: "DONE";
  mode: "ST" | "ROUTING";
  workbook?: ParsedWorkbook;
  routingWorkbook?: ParsedRoutingWorkbook;
  sha256: string;
};

type WorkerErrorMessage = {
  type: "ERROR";
  error: string;
};

type WorkerResponse = WorkerProgressMessage | WorkerDoneMessage | WorkerErrorMessage;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function runParserWorker(
  file: File,
  mode: "ST" | "ROUTING",
  onProgress?: (progress: ParseProgress) => void
): Promise<WorkerDoneMessage> {
  onProgress?.({ stage: "READING", percent: 2 });
  await yieldToBrowser();

  const buffer = await file.arrayBuffer();
  onProgress?.({ stage: "READING", percent: 8 });
  await yieldToBrowser();

  return await new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./excel-parser.worker.ts", import.meta.url), {
      type: "module",
      name: mode === "ROUTING" ? "st-routing-excel-parser" : "st-planning-excel-parser",
    });

    let settled = false;
    const timeoutMs = mode === "ROUTING" ? 180_000 : 120_000;
    const watchdog = window.setTimeout(() => {
      fail(`Excel parsing timed out after ${Math.round(timeoutMs / 1000)} seconds. The workbook may be damaged or unusually large.`);
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(watchdog);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (!message || typeof message !== "object" || !("type" in message)) return;

      if (message.type === "PROGRESS") {
        onProgress?.(message.progress);
        return;
      }
      if (message.type === "ERROR") {
        fail(message.error || "Excel parser worker failed.");
        return;
      }
      if (message.type === "DONE") {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(message);
      }
    };

    worker.onerror = (event) => fail(event.message || "Excel parser worker crashed.");
    worker.onmessageerror = () => fail("The browser could not transfer parsed Excel data from the worker.");

    worker.postMessage({ type: "PARSE", mode, filename: file.name, buffer }, [buffer]);
  });
}

export async function parseWorkbook(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): Promise<{ workbook: ParsedWorkbook; sha256: string }> {
  const result = await runParserWorker(file, "ST", onProgress);
  if (!result.workbook) throw new Error("The ST workbook parser returned no workbook data.");
  return { workbook: result.workbook, sha256: result.sha256 };
}

export async function parseRoutingWorkbook(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): Promise<{ workbook: ParsedRoutingWorkbook; sha256: string }> {
  const result = await runParserWorker(file, "ROUTING", onProgress);
  if (!result.routingWorkbook) throw new Error("The routing workbook parser returned no route data.");
  return { workbook: result.routingWorkbook, sha256: result.sha256 };
}
