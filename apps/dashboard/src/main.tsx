import { pickLocale } from '@mensa/shared';
import { I18nProvider } from '@mensa/shared/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FinanceSessionProvider } from './finance/session';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <I18nProvider initialLocale={pickLocale(navigator.language)}>
      <FinanceSessionProvider>
        <App />
      </FinanceSessionProvider>
    </I18nProvider>
  </StrictMode>,
);
