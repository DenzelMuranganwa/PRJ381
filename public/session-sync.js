'use strict';

(() => {
  let requestInFlight = false;

  async function syncSession() {
    if (requestInFlight) return;
    requestInFlight = true;
    try {
      const response = await fetch('/api/sessions/heartbeat', {
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        throw new Error(`Session sync failed with HTTP ${response.status}.`);
      }
    } catch (error) {
      console.warn('Session sync failed:', error);
    } finally {
      requestInFlight = false;
    }
  }

  void syncSession();
  window.setInterval(syncSession, 5000);
})();
