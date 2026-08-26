API client has no timeout, retry, or pagination
---
### What is broken?

`src/features/api/client.ts` is the shared HTTP layer used by every feature,
and it has three defects that show up as flakiness everywhere else.

1. **`timeoutMs` is accepted and then ignored.** There is no `AbortController`,
   so a hung request hangs forever and the dashboard spins indefinitely.
2. **No retry.** A single transient `502` or `429` fails the whole call, even
   though `isRetryableStatus` already exists and is never used.
3. **`fetchAllPages` only returns the first page.** It parses the `Link` header
   via `parseNextLink` and then discards it, so anything past the first page is
   silently missing.

### Reproduction

1. Point the dashboard at a repository with more than one page of issues.
2. Only the first page appears, with no error and no indication anything is
   missing.

For the timeout: call `getJson` with `timeoutMs: 100` against an endpoint that
never responds. The promise never settles.

### Expected behaviour

Timeouts should abort the request for real. Retries should be bounded, backed
off, and limited to retryable statuses. `fetchAllPages` should follow `Link:
rel="next"` until exhaustion, with a page cap so a pathological response cannot
loop forever.

### Customer impact

Degraded — a workflow is harder than it should be

### Suspected area (optional)

`src/features/api/client.ts`
