import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { applyTheme } from './theme/theme';
import App from './App';
import { useApp } from './store/useApp';

if (import.meta.env.DEV) (window as unknown as { __sm: typeof useApp }).__sm = useApp; // test hook, dev only

applyTheme();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
