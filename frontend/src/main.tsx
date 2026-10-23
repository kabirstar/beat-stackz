import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.tsx";

async function enableMocking() {
  if (import.meta.env.VITE_MOCK === "false") {
    return;
  }
  try {
    const { worker } = await import("./mocks/browser.ts");
    await worker.start({
      onUnhandledRequest: "bypass",
      quiet: true,
    });
  } catch {
    // T078: Always render the app even if the mock service worker fails to register
  }
}

void enableMocking().finally(() => {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
