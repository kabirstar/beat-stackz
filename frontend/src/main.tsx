import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.tsx";

async function enableMocking() {
  if (import.meta.env.VITE_MOCK === "false") {
    return;
  }
  const { worker } = await import("./mocks/browser.ts");
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
  });
}

void enableMocking().then(() => {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
