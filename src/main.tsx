import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/App";
import { ThemeProvider } from "./features/theme/model/ThemeProvider";
import { initializeTheme } from "./features/theme/model/theme";
import "./app/styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element is missing");
}

initializeTheme();

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
