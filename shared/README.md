# @bpackz/shared

The API contract. Every route = zod schemas for params/query/body/response +
method, path, auth mode. Red implements `routes.*` exactly; Yellow consumes
them through the client (T003 adds MSW mocks generated from these).

Change requests go to Blue via `comms/<you>/<task>.md`. Do not edit here.

## Mocks (for `frontend/`)

`@bpackz/shared/mocks` exports msw handlers for every route, backed by an
in-memory store seeded with one artist (`u_me`), a personal vault (`v_personal`),
a shared vault (`v_shared`) with a producer member, folders and audio files.

```ts
// frontend/src/mocks/browser.ts
import { setupWorker } from "msw/browser";
import { handlers, MOCK_API } from "@bpackz/shared/mocks";
export const worker = setupWorker(...handlers);
// main.tsx: if (import.meta.env.VITE_MOCK) await worker.start(); API base = MOCK_API
```

Every handler validates the request body with the route's zod schema (400 with
`issues` on failure) and parses its own response through the response schema,
so a mock cannot return a shape the real API won't. The fake bucket at
`MOCK_BUCKET` accepts part PUTs (returns an ETag) and GETs, so the Uppy
multipart flow and `<audio src>` resolve. `createHandlers(seed())` gives a
fresh store per test. Rebuild (`pnpm -F @bpackz/shared build`) after pulling.
