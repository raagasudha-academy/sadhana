import React from 'react';
import { createRoot } from 'react-dom/client';
import CloudAuth from './CloudAuth';
import './styles.css';
import './authPolish.css';

const assetRetryKey = (assetUrl: string) => `sadhana:asset-retry:${assetUrl}`;
const recoveryAttemptedOnThisLoad = new URL(window.location.href).searchParams.has(
  '__sadhana_asset_retry',
);

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const preloadEvent = event as Event & { payload?: { url?: string } };
  const failedAsset = preloadEvent.payload?.url || 'unknown-asset';
  const retryKey = assetRetryKey(failedAsset);
  const now = Date.now();
  let lastAttempt = 0;

  try {
    lastAttempt = Number(window.sessionStorage.getItem(retryKey) || 0);
  } catch {
    // Storage may be unavailable in private browsing; the URL flag below still
    // prevents a reload loop for this page load.
  }

  const url = new URL(window.location.href);

  if (recoveryAttemptedOnThisLoad || now - lastAttempt < 120_000) {
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <main style="max-width: 36rem; margin: 12vh auto; padding: 2rem; color: #203a5b; font: 16px/1.5 system-ui, sans-serif">
          <h1 style="font-size: 1.5rem">The portal has just been updated</h1>
          <p>A page file is still unavailable. Refresh the page to load the latest version.</p>
          <button type="button" style="border: 0; border-radius: 0.75rem; padding: 0.8rem 1.2rem; background: #193657; color: white; font: inherit; cursor: pointer">Refresh portal</button>
        </main>`;
      root.querySelector('button')?.addEventListener('click', () => window.location.reload());
    }
    return;
  }

  try {
    window.sessionStorage.setItem(retryKey, String(now));
  } catch {
    // The retry query parameter is the fallback loop guard.
  }

  url.searchParams.set('__sadhana_asset_retry', String(now));
  window.location.replace(url.toString());
});

// The query parameter only busts the stale Pages document cache for the retry.
// Remove it from the visible URL once this entry bundle has loaded.
const currentUrl = new URL(window.location.href);
if (currentUrl.searchParams.has('__sadhana_asset_retry')) {
  currentUrl.searchParams.delete('__sadhana_asset_retry');
  window.history.replaceState(window.history.state, '', currentUrl.toString());
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CloudAuth />
  </React.StrictMode>,
);
