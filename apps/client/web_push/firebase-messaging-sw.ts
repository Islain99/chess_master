// ─────────────────────────────────────────────────────────────────────────────
// Sprint 16 — Service worker Firebase Cloud Messaging (client Web)
//
// Source TypeScript, empaquetée par esbuild (SDK Firebase modulaire : la
// méthode recommandée par FlutterFire, l'ancien importScripts « compat »
// étant déprécié). Sortie : dist/firebase-messaging-sw.js, copiée par
// tool/bootstrap_platforms.* vers web/push/.
//
// Servi depuis /push/ (portée distincte du service worker de Flutter) et
// configuré par sa propre URL :
//   /push/firebase-messaging-sw.js?apiKey=…&appId=…&messagingSenderId=…&projectId=…
// (cf. FirebaseConfig.webServiceWorkerPath) → aucun identifiant en dur.
//
// Les messages de l'API contiennent un bloc « notification » : le SDK les
// affiche lui-même quand l'application est en arrière-plan.
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app';
import { getMessaging, isSupported } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;

const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get('apiKey') ?? '',
  appId: params.get('appId') ?? '',
  messagingSenderId: params.get('messagingSenderId') ?? '',
  projectId: params.get('projectId') ?? '',
};

// Activer immédiatement les nouvelles versions du service worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

if (config.apiKey && config.appId && config.projectId) {
  isSupported().then((supported) => {
    if (!supported) return;
    // Doit précéder notre écouteur « notificationclick » : quand l'API fournit
    // un lien HTTPS (PUBLIC_WEB_URL), c'est le SDK qui gère le clic.
    getMessaging(initializeApp(config));
    self.addEventListener('notificationclick', onNotificationClick);
  });
} else {
  console.warn('[push] configuration Firebase absente de l\'URL du service worker');
}

/** Clic sans lien fourni par l'API : ramener l'onglet de l'appli (ou l'ouvrir). */
function onNotificationClick(event: NotificationEvent) {
  event.notification.close();
  const data = (event.notification.data?.FCM_MSG?.data ?? {}) as Record<string, string>;
  const scope = new URL(self.registration.scope);
  const appRoot = new URL('..', scope); // /push/ → racine de l'application
  const target = new URL(data.gameId ? `?game=${encodeURIComponent(data.gameId)}` : '', appRoot);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((w) => new URL(w.url).origin === target.origin);
      if (existing) return existing.focus();
      return self.clients.openWindow(target.href);
    }),
  );
}
