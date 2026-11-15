import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "@fontsource-variable/anek-bangla/standard.css"; // self-hosted: width + weight axes, Bangla + Latin
import "./index.css";
import { LangProvider } from "./i18n";
import Landing from "./pages/Landing";

// The portal is a separate chunk; landing visitors never download it.
const PortalLayout = lazy(() => import("./portal/PortalLayout"));
const CallsPage = lazy(() => import("./portal/CallsPage"));
const CallDetailPage = lazy(() => import("./portal/CallDetailPage"));
const DataModelPage = lazy(() => import("./portal/DataModelPage"));
const AppointmentsPage = lazy(() => import("./portal/WorkPages").then((m) => ({ default: m.AppointmentsPage })));
const CallbacksPage = lazy(() => import("./portal/WorkPages").then((m) => ({ default: m.CallbacksPage })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen bg-paper" />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<CallsPage />} />
              <Route path="calls/:id" element={<CallDetailPage />} />
              <Route path="appointments" element={<AppointmentsPage />} />
              <Route path="callbacks" element={<CallbacksPage />} />
              <Route path="data-model" element={<DataModelPage />} />
            </Route>
            <Route path="*" element={<Landing />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </LangProvider>
  </StrictMode>,
);
