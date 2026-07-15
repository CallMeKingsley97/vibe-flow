import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "../widgets/app-shell/AppShell";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { SettingsPage } from "../pages/settings/SettingsPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
