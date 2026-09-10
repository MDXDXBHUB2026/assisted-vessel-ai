import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useSimulationLoop } from '@/hooks/useSimulationLoop'
import { AppShell } from '@/layouts/AppShell'
import { LandingPage } from '@/features/landing/LandingPage'
import { ConsolePage } from '@/features/vessel/ConsolePage'
import { DigitalTwinPage } from '@/features/vessel/DigitalTwinPage'
import { NavigationPage } from '@/features/navigation/NavigationPage'
import { MachineryPage } from '@/features/machinery/MachineryPage'
import { MaintenancePage } from '@/features/maintenance/MaintenancePage'
import { VoyagePage } from '@/features/voyage/VoyagePage'
import { CargoPage } from '@/features/cargo/CargoPage'
import { SafetyPage } from '@/features/safety/SafetyPage'
import { AlarmsPage } from '@/features/alarms/AlarmsPage'
import { EnvelopePage } from '@/features/assistance/EnvelopePage'
import { DecisionCentrePage } from '@/features/assistance/DecisionCentrePage'
import { CopilotPage } from '@/features/assistance/CopilotPage'
import { ScenarioControlPage } from '@/features/assistance/ScenarioControlPage'
import { AuditPage } from '@/features/audit/AuditPage'
import { ShoreCentrePage } from '@/features/shore/ShoreCentrePage'
import { ArchitecturePage } from '@/features/architecture/ArchitecturePage'
import { ConOpsPage } from '@/features/conops/ConOpsPage'

export function App() {
  useSimulationLoop()

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route element={<AppShell section="vessel" />}>
          <Route path="/vessel" element={<Navigate to="/vessel/console" replace />} />
          <Route path="/vessel/console" element={<ConsolePage />} />
          <Route path="/vessel/digital-twin" element={<DigitalTwinPage />} />
          <Route path="/vessel/navigation" element={<NavigationPage />} />
          <Route path="/vessel/machinery" element={<MachineryPage />} />
          <Route path="/vessel/maintenance" element={<MaintenancePage />} />
          <Route path="/vessel/voyage-energy" element={<VoyagePage />} />
          <Route path="/vessel/cargo" element={<CargoPage />} />
          <Route path="/vessel/safety" element={<SafetyPage />} />
          <Route path="/vessel/alarms" element={<AlarmsPage />} />
          <Route path="/vessel/envelope" element={<EnvelopePage />} />
          <Route path="/vessel/decisions" element={<DecisionCentrePage />} />
          <Route path="/vessel/audit" element={<AuditPage />} />
          <Route path="/vessel/copilot" element={<CopilotPage />} />
          <Route path="/vessel/scenarios" element={<ScenarioControlPage />} />
          <Route path="/architecture" element={<ArchitecturePage />} />
          <Route path="/conops" element={<ConOpsPage />} />
        </Route>

        <Route element={<AppShell section="shore" />}>
          <Route path="/shore" element={<ShoreCentrePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
