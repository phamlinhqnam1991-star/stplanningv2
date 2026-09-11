# ST Planning Clean Rebuild v009 — Route Analysis

Adds the first derived routing engine on top of v008.

- Current Position anchored to All Open Jobs `NextOperation`
- Remaining full route
- Job-specific ST scope from active Planning `AllOperation`
- Remaining ST route
- Next ST Operation
- Visual ST markers on Job Routing
- No database migration required
- No legacy ST Operation Mapping is imported
- No Candidate / Batch / Recipe / Auto Planning logic

Run existing SQL only through v008. v009 requires no new SQL file.
