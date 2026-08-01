import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { hydrateUiPreferencesFromStorage } from './services/preferencesService';
import './index.css';

hydrateUiPreferencesFromStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
