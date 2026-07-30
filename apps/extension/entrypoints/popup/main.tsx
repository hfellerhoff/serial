import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./style.css";

function initializePopup() {
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  function applyColorScheme() {
    document.documentElement.classList.toggle("dark", colorScheme.matches);
  }
  applyColorScheme();
  colorScheme.addEventListener("change", applyColorScheme);

  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Unable to find the extension popup root");
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

initializePopup();
