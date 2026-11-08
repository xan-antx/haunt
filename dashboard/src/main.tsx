import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Fonts are bundled from npm (SIL Open Font License). Nothing is loaded from a CDN.
import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';

import './styles/tokens.css';
import './styles/global.css';
import './styles/motion.css';

import { App } from './App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
