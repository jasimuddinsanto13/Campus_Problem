/**
 * Firebase Cloud Messaging background service worker (bundled by Vite).
 *
 * Registered from src/lib/firebase.js as a module worker, so the Firebase
 * web config (VITE_FIREBASE_*) is baked in at build time. Shows a system
 * notification for background pushes and opens the student cancellations
 * page when it is tapped.
 */
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

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

if (CONFIG) {
  const messaging = getMessaging(initializeApp(CONFIG));

  onBackgroundMessage(messaging, (payload) => {
    const { title, body } = payload.notification || {};
    self.registration.showNotification(title || 'Class Cancelled', {
      body,
      data: payload.data || {},
    });
  });
}

// Tapping the notification opens (or focuses + navigates) the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/student/cancellations';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if (client.navigate) client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
