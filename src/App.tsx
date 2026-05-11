import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { SimulationProvider } from './store/SimulationContext';
import { LanguageProvider } from './i18n/LanguageProvider';
import SimulationDashboard from './pages/SimulationDashboard';
import ProfileEditor from './pages/ProfileEditor';
import ScenarioEditor from './pages/ScenarioEditor';
import TemplateBrowser from './pages/TemplateBrowser';
import PeripheralDesigner from './pages/PeripheralDesigner/PeripheralDesigner';
import BusProtocols from './pages/BusProtocols';
import HelpPage from './pages/Help';
import OnboardingFlow from './components/Onboarding/OnboardingFlow';
import { useOnboarding } from './hooks/useOnboarding';

function AppRoutes() {
  const { show, dismiss } = useOnboarding();
  return (
    <>
      {show && <OnboardingFlow onDone={dismiss} />}
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<SimulationDashboard />} />
          <Route path="/profiles" element={<ProfileEditor />} />
          <Route path="/scenarios" element={<ScenarioEditor />} />
          <Route path="/designer" element={<PeripheralDesigner />} />
          <Route path="/templates" element={<TemplateBrowser />} />
          <Route path="/protocols" element={<BusProtocols />} />
        </Route>
        <Route path="/help" element={<HelpPage />} />
      </Routes>
    </>
  );
}

import { ThemeProvider } from 'next-themes';
import { UpdateChecker } from './components/UpdateChecker/UpdateChecker';

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <LanguageProvider>
        <SimulationProvider>
          <BrowserRouter>
            <AppRoutes />
            <UpdateChecker />
          </BrowserRouter>
        </SimulationProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
