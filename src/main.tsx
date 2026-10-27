import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/i18n"; // inicializace překladů musí proběhnout před prvním vykreslením
import "@/styles/index.css";
import { App } from "@/app/App";
import { AppCrash, ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { installGlobalErrorHandlers } from "@/lib/errors";

// Neošetřené chyby z asynchronního kódu – oznámit, ne mlčky spolknout
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Poslední záchrana: spadne-li celé okno, místo bílé obrazovky „Načíst znovu“ */}
    <ErrorBoundary name="app" fallback={(error) => <AppCrash error={error} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
