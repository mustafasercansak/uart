import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initProfileStorage } from './store/storage';

// Restore profiles from Tauri FS into localStorage before the first render so
// that all synchronous loadProfiles() calls throughout the app see fresh data.
initProfileStorage().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
});
