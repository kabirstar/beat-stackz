import { setupWorker } from "msw/browser";
import { MOCK_API } from "@bpackz/shared/mocks";
import { createFrontendMockHandlers, savePersistedStore } from "./handlers.ts";

const { handlers, session } = createFrontendMockHandlers();

export const worker = setupWorker(...handlers);

worker.events.on("response:mocked", () => {
  savePersistedStore(session.store);
});

export { MOCK_API, session as mockSession };
