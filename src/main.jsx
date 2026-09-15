import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
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
