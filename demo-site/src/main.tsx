import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { i18nReady } from './i18n/config';
import { App } from './App';
import './index.css';

function render() {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element #root not found');
  }
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// Render once translations have loaded (or failed, in which case keys fall back to English).
i18nReady.then(render, render);
