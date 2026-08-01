import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import './index.css';

// Log any uncaught errors for debugging
window.addEventListener('error', (e) => {
  console.error('[Global] Uncaught error:', e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Global] Unhandled promise rejection:', e.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
