import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { SimulationProvider } from './store/SimulationContext';
import SimulationDashboard from './pages/SimulationDashboard';
import ProfileEditor from './pages/ProfileEditor';
import ScenarioEditor from './pages/ScenarioEditor';
import TemplateBrowser from './pages/TemplateBrowser';

export default function App() {
  return (
    <SimulationProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<SimulationDashboard />} />
            <Route path="/profiles" element={<ProfileEditor />} />
            <Route path="/scenarios" element={<ScenarioEditor />} />
            <Route path="/templates" element={<TemplateBrowser />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SimulationProvider>
  );
}
