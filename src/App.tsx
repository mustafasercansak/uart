import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { SimulationProvider } from './store/SimulationContext';
import { LanguageProvider } from './i18n/LanguageProvider';
import SimulationDashboard from './pages/SimulationDashboard';
import ProfileEditor from './pages/ProfileEditor';
import ScenarioEditor from './pages/ScenarioEditor';
import TemplateBrowser from './pages/TemplateBrowser';
import PeripheralDesigner from './pages/PeripheralDesigner/PeripheralDesigner';
import HelpPage from './pages/Help';
import OnboardingFlow from './components/Onboarding/OnboardingFlow';
import { useOnboarding } from './hooks/useOnboarding';
import { ErrorBoundary } from './components/ErrorBoundary';

function AppRoutes() {
  const { show, dismiss } = useOnboarding();
  return (
    <>
      {show && <OnboardingFlow onDone={dismiss} />}
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ErrorBoundary><SimulationDashboard /></ErrorBoundary>} />
          <Route path="/profiles" element={<ErrorBoundary><ProfileEditor /></ErrorBoundary>} />
          <Route path="/scenarios" element={<ErrorBoundary><ScenarioEditor /></ErrorBoundary>} />
          <Route path="/designer" element={<ErrorBoundary><PeripheralDesigner /></ErrorBoundary>} />
          <Route path="/templates" element={<ErrorBoundary><TemplateBrowser /></ErrorBoundary>} />
        </Route>
        <Route path="/help" element={<ErrorBoundary><HelpPage /></ErrorBoundary>} />
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
