import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Minimal global reset — keeps system defaults clean without a CSS framework.
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
  a { color: inherit; }
  button { font-family: inherit; }
`;
document.head.appendChild(style);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
