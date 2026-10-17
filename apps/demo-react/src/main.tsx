import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import favicon from 'demo-kit/favicon.svg?url';
import { initTheme } from 'demo-kit/theme';
import 'demo-kit/site.css';
import App from './App';

// The stored or system theme lands on <html> before the first render
initTheme();
document.head.append(
  Object.assign(document.createElement('link'), { rel: 'icon', type: 'image/svg+xml', href: favicon }),
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
