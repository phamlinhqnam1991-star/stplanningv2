"use client";

import type { ParsedWorkbook } from "@/lib/types";

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
  workbook: ParsedWorkbook;
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

export async function parseWorkbook(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): Promise<{ workbook: ParsedWorkbook; sha256: string }> {
  onProgress?.({ stage: "READING", percent: 2 });
  await yieldToBrowser();

  const buffer = await file.arrayBuffer();
  onProgress?.({ stage: "READING", percent: 8 });
  await yieldToBrowser();

  return await new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./excel-parser.worker.ts", import.meta.url), {
      type: "module",
      name: "st-planning-excel-parser",
    });

    let settled = false;
    const watchdog = window.setTimeout(() => {
      fail("Excel parsing timed out after 120 seconds. The workbook may be damaged or unusually large.");
    }, 120_000);

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
        resolve({ workbook: message.workbook, sha256: message.sha256 });
      }
    };

    worker.onerror = (event) => fail(event.message || "Excel parser worker crashed.");
    worker.onmessageerror = () => fail("The browser could not transfer parsed Excel data from the worker.");

    worker.postMessage({ type: "PARSE", filename: file.name, buffer }, [buffer]);
  });
}
