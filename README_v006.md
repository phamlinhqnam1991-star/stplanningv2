# ST Planning Clean Rebuild v006 — TypeScript BlobPart build fix

Changed only:
- `lib/excel-parser.worker.ts`

Fixes TypeScript 5.9 error `TS2322` where `Uint8Array<ArrayBufferLike>` was not assignable to `BlobPart`.
The worker now copies compressed ZIP bytes into an owned `Uint8Array` and passes `owned.buffer` (guaranteed `ArrayBuffer`) to `Blob`.

No SQL, import model, parsing logic, normalization, UI, or Aiven behavior was changed.
