# Routing Analysis v001

This phase derives route context without adding legacy planning logic.

## Source priority

1. `VN_AllOpenJobs_SpiritSunshine_ALL` is authoritative for the full Job route and `NextOperation`.
2. `SirusClean_Painting_MasterList.AllOperation` is the ST-scope list for the same `JobNum`.
3. No hard-coded ST Operation Mapping is used in this phase.

## Current Position

The engine first finds the route occurrence matching source `NextOperation`, preferring an incomplete occurrence. If source `NextOperation` cannot be matched, it falls back to the first incomplete operation and marks the position source as `FIRST_INCOMPLETE`.

## Remaining Route

All route operations from Current Position to the end of the full Job route, preserving source order and OprSeq.

## Remaining ST Route

`AllOperation` is split on `|` and normalized only for comparison. Remaining Route is intersected with that Job-specific ST scope. The original operation code/order from All Open Jobs is retained.

## Next ST Operation

The first item in Remaining ST Route. If the Planning source does not contain the Job or `AllOperation` is blank, Next ST remains null and the UI reports `No Planning match`.

No Candidate, Batch, Recipe Rule, Planning Chain, ST Mapping, or Auto Planning logic is introduced here.
