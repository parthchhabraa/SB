import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PreviewApp } from "./app";
import "./preview.css";

const root = document.getElementById("root");
if (!root) throw new Error("Preview root element is missing.");

createRoot(root).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>,
);
