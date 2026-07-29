import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./style.css";

const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
function applyColorScheme() {
  document.documentElement.classList.toggle("dark", colorScheme.matches);
}
applyColorScheme();
colorScheme.addEventListener("change", applyColorScheme);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
