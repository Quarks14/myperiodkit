import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import './style.css';
import './recovery.css';
import 'leaflet/dist/leaflet.css';

const root = document.getElementById('root');
if (!root) throw new Error('The application root element is missing.');

createRoot(root).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter><App /></BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);
