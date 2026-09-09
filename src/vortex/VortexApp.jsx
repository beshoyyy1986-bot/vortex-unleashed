import React from 'react';
import App from './SecureDashboardApp.jsx';
import Mascot from './components/Mascot.jsx';
import { LangProvider } from './i18n.jsx';
import './index.css';

export default function VortexApp() {
  return (
    <LangProvider>
      <App />
      <Mascot />
    </LangProvider>
  );
}
