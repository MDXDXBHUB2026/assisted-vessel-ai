import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useSimulationLoop } from '@/hooks/useSimulationLoop'
import { AppShell } from '@/layouts/AppShell'

const LandingPage = lazy(() => import('@/features/landing/LandingPage').then((m) => ({ default: m.LandingPage })))
const OperationsCanvasPage = lazy(() => import('@/features/operations/OperationsCanvasPage').then((m) => ({ default: m.OperationsCanvasPage })))
const EngineeringOperationsPage = lazy(() => import('@/features/engineering/EngineeringOperationsPage').then((m) => ({ default: m.EngineeringOperationsPage })))
const DigitalTwinPage = lazy(() => import('@/features/vessel/DigitalTwinPage').then((m) => ({ default: m.DigitalTwinPage })))
const NavigationPage = lazy(() => import('@/features/navigation/NavigationPage').then((m) => ({ default: m.NavigationPage })))
const MachineryPage = lazy(() => import('@/features/machinery/MachineryPage').then((m) => ({ default: m.MachineryPage })))
const MaintenancePage = lazy(() => import('@/features/maintenance/MaintenancePage').then((m) => ({ default: m.MaintenancePage })))
const VoyagePage = lazy(() => import('@/features/voyage/VoyagePage').then((m) => ({ default: m.VoyagePage })))
const CargoPage = lazy(() => import('@/features/cargo/CargoPage').then((m) => ({ default: m.CargoPage })))
const SafetyPage = lazy(() => import('@/features/safety/SafetyPage').then((m) => ({ default: m.SafetyPage })))
const AlarmsPage = lazy(() => import('@/features/alarms/AlarmsPage').then((m) => ({ default: m.AlarmsPage })))
const EnvelopePage = lazy(() => import('@/features/assistance/EnvelopePage').then((m) => ({ default: m.EnvelopePage })))
const DecisionCentrePage = lazy(() => import('@/features/assistance/DecisionCentrePage').then((m) => ({ default: m.DecisionCentrePage })))
const CopilotPage = lazy(() => import('@/features/assistance/CopilotPage').then((m) => ({ default: m.CopilotPage })))
const ScenarioControlPage = lazy(() => import('@/features/assistance/ScenarioControlPage').then((m) => ({ default: m.ScenarioControlPage })))
const AuditPage = lazy(() => import('@/features/audit/AuditPage').then((m) => ({ default: m.AuditPage })))
const ShoreCentrePage = lazy(() => import('@/features/shore/ShoreCentrePage').then((m) => ({ default: m.ShoreCentrePage })))
const ArchitecturePage = lazy(() => import('@/features/architecture/ArchitecturePage').then((m) => ({ default: m.ArchitecturePage })))
const ConOpsPage = lazy(() => import('@/features/conops/ConOpsPage').then((m) => ({ default: m.ConOpsPage })))
const SystemAssurancePage = lazy(() => import('@/features/assurance/SystemAssurancePage').then((m) => ({ default: m.SystemAssurancePage })))
const EngineeringAssurancePage = lazy(() => import('@/features/assurance/EngineeringAssurancePage').then((m) => ({ default: m.EngineeringAssurancePage })))
const RequirementsVerificationPage = lazy(() => import('@/features/assurance/RequirementsVerificationPage').then((m) => ({ default: m.RequirementsVerificationPage })))
const OperationalValuePage = lazy(() => import('@/features/value/OperationalValuePage').then((m) => ({ default: m.OperationalValuePage })))

function RouteFallback() {
  return (
    <div className="flex h-40 items-center justify-center text-xs uppercase tracking-widest text-ink-700">Loading module…</div>
  )
}

export function App() {
  useSimulationLoop()

  return (
    <HashRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route element={<AppShell section="vessel" />}>
            <Route path="/vessel" element={<Navigate to="/vessel/console" replace />} />
            <Route path="/vessel/console" element={<OperationsCanvasPage />} />
            <Route path="/engineering" element={<EngineeringOperationsPage />} />
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
            <Route path="/assurance/system" element={<SystemAssurancePage />} />
            <Route path="/assurance/programme" element={<EngineeringAssurancePage />} />
            <Route path="/assurance/requirements" element={<RequirementsVerificationPage />} />
            <Route path="/value" element={<OperationalValuePage />} />
          </Route>

          <Route element={<AppShell section="shore" />}>
            <Route path="/shore" element={<ShoreCentrePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
