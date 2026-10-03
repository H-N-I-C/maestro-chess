import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // first visit on a host without COOP/COEP headers (GitHub Pages): once the
    // worker controls the page it adds them, so reload once to become
    // cross-origin isolated and unlock the multithreaded engine
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (window.crossOriginIsolated) return;
      try {
        if (sessionStorage.getItem('maestro-coi-reload')) return;
        sessionStorage.setItem('maestro-coi-reload', '1');
      } catch { return; }
      window.location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // a new worker already waiting (e.g. after a deploy)? offer the update now
      if (reg.waiting) showUpdateToast(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          // "installed" while the page is controlled = an update, not first install
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(worker);
          }
        });
      });
    });
  });
}

function showUpdateToast(worker) {
  if (document.querySelector('.update-toast')) return;
  const toast = document.createElement('div');
  toast.className = 'update-toast';
  const msg = document.createElement('span');
  msg.textContent = 'A new version of Maestro is ready.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Refresh';
  btn.addEventListener('click', () => {
    worker.postMessage?.({ type: 'SKIP_WAITING' });
    window.location.reload();
  });
  toast.append(msg, btn);
  document.body.appendChild(toast);
}
