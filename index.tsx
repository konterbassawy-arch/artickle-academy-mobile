import './src/vendor.ts'; // bundle jsPDF / SheetJS / JSZip (replaces former CDN <script> tags)
import './index.css'; // Tailwind + global styles, compiled at build time (replaces CDN Tailwind)
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { AppProvider } from './context/AppContext.tsx';
import { DevBanner } from './components/DevBanner.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppProvider>
      <DevBanner />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppProvider>
  </React.StrictMode>
);
