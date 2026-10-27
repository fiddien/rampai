import "./mantine.css";
import "prosemirror-view/style/prosemirror.css";
import "./style.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { deviceStore } from "./sync/storage";
import { App } from "./app/App";

// Every module, the WASM included, has loaded: tell the stale-page guard in index.html.
(window as Window & { __rampaiStarted?: () => void }).__rampaiStarted?.();

// ——— The interface fades while the writer types, and returns when the mouse moves ———
let lastMouse = { x: -1, y: -1 };
document.addEventListener("keydown", (e) => {
  const inEditor = (e.target as HTMLElement | null)?.closest?.(".ProseMirror");
  if (inEditor && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace")) {
    document.body.classList.add("typing");
  }
});
document.addEventListener("mousemove", (e) => {
  if (Math.abs(e.clientX - lastMouse.x) + Math.abs(e.clientY - lastMouse.y) > 6) document.body.classList.remove("typing");
  lastMouse = { x: e.clientX, y: e.clientY };
});

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App store={deviceStore()} />
  </StrictMode>,
);
