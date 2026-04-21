import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { SimulationProvider } from './store/SimulationContext';
import { LanguageProvider } from './i18n/LanguageProvider';
import SimulationDashboard from './pages/SimulationDashboard';
import ProfileEditor from './pages/ProfileEditor';
import ScenarioEditor from './pages/ScenarioEditor';
import TemplateBrowser from './pages/TemplateBrowser';
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
          <Route path="/templates" element={<TemplateBrowser />} />
        </Route>
        <Route path="/help" element={<HelpPage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <SimulationProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SimulationProvider>
    </LanguageProvider>
  );
}
