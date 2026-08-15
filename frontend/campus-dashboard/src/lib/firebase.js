/**
 * Firebase Cloud Messaging (FCM) client helpers.
 *
 * Configure through campus-dashboard/.env.local (public web config):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *   VITE_FIREBASE_VAPID_KEY
 *
 * When the config is absent every helper no-ops, so the app runs fine without
 * push — the in-app banner, bell and pages still work.
 */
import { getCookie, getCsrfToken } from './csrf';

const CONFIG = (() => {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return null;
  return {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
})();

/**
 * One-time setup: register the bundled service worker, request permission,
 * store the FCM token on the backend, and refresh the UI on foreground push.
 * Safe to call on every page load — subscribing is idempotent. Only engages
 * when Firebase is configured AND a user is signed in (never prompts for
 * notification permission on the public login page).
 */
export async function initPushNotifications() {
  if (!CONFIG) return;
  if (!getCookie('sessionid')) return; // signed out — skip setup

  if ('serviceWorker' in navigator) {
    try {
      // Vite bundles src/firebase-messaging-sw.js (env baked in at build time).
      await navigator.serviceWorker.register(
        new URL('../firebase-messaging-sw.js', import.meta.url),
        { type: 'module' },
      );
    } catch {
      /* worker registration failure — background push unavailable */
    }
  }

  if (!('Notification' in window) || !navigator.serviceWorker) return;

  try {
    // Lazy-load the Firebase SDK only when configured (keeps the bundle lean).
    const { initializeApp } = await import('firebase/app');
    const { getMessaging, getToken, onMessage } = await import('firebase/messaging');

    const messaging = getMessaging(initializeApp(CONFIG));

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      });
      if (token) {
        await fetch('/api/push/subscribe/', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken(),
          },
          body: JSON.stringify({ token, platform: 'web' }),
        });
      }
    }

    // Foreground messages: refresh the dashboard banner + header bell at once.
    onMessage(messaging, () => {
      window.dispatchEvent(new CustomEvent('app:cancellation-push'));
    });
  } catch {
    /* push unavailable — in-app alerts still cover the flow */
  }
}
