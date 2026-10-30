import { pickLocale } from '@mensa/shared';
import { I18nProvider } from '@mensa/shared/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <I18nProvider initialLocale={pickLocale(navigator.language)}>
      <App />
    </I18nProvider>
  </StrictMode>,
);
