import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initProfileStorage } from './store/storage';
import { initCANProfileStorage } from './can/store/canProfileStorage';

// Restore profiles from Tauri FS into localStorage before the first render so
// that all synchronous load*() calls throughout the app see fresh data.
Promise.all([initProfileStorage(), initCANProfileStorage()]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
});
