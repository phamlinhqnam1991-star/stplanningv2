"use client";

import type { ParsedWorkbook } from "@/lib/types";

export type ParseProgress = {
  stage: "READING" | "DECODING" | "PARSING" | "COMPLETE";
  sheet?: string;
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

  // Reading the file bytes is asynchronous. The expensive XLSX decode/parse is
  // intentionally moved to a dedicated Web Worker below so it can never block
  // React or the browser UI thread.
  const buffer = await file.arrayBuffer();
  onProgress?.({ stage: "READING", percent: 8 });
  await yieldToBrowser();

  return await new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./excel-parser.worker.ts", import.meta.url), {
      type: "module",
      name: "st-planning-excel-parser",
    });

    let settled = false;

    const cleanup = () => {
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

    worker.onerror = (event) => {
      fail(event.message || "Excel parser worker crashed.");
    };

    worker.onmessageerror = () => {
      fail("The browser could not transfer parsed Excel data from the worker.");
    };

    // Transfer ownership instead of copying the 6+ MB workbook buffer.
    worker.postMessage(
      {
        type: "PARSE",
        filename: file.name,
        buffer,
      },
      [buffer]
    );
  });
}
