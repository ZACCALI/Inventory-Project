/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { Serwist, NetworkFirst, NetworkOnly } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const customCache: RuntimeCaching[] = [
  {
    matcher: /\/api\/test-ping.*/i,
    handler: new NetworkOnly(),
  },
  // --- AUTH SESSION ROUTE: NetworkFirst for offline session preservation ---
  {
    matcher: /\/api\/auth\/session.*/i,
    handler: new NetworkFirst({
      cacheName: "next-auth-session",
      networkTimeoutSeconds: 5,
    }),
  },
  // --- OTHER AUTH ROUTES (csrf, callback, signin, signout): ALWAYS NetworkOnly ---
  {
    matcher: /\/api\/auth\/(csrf|callback|signin|signout).*/i,
    handler: new NetworkOnly(),
  },
  {
    matcher: /\/api\/settings.*/i,
    handler: new NetworkFirst({
      cacheName: "app-settings",
      matchOptions: {
        ignoreSearch: true,
      }
    }),
  },
  {
    matcher: /\/api\/(customers|drivers|products|orders|expenses|history|categories|units|reports).*/i,
    handler: new NetworkFirst({
      cacheName: "core-api-data",
      networkTimeoutSeconds: 10,
    }),
  },
  {
    matcher: ({ request }) => request.mode === 'navigate',
    handler: new NetworkFirst({
      cacheName: "page-navigations",
      networkTimeoutSeconds: 10,
    }),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: customCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document" || request.mode === "navigate";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// ── Push Notification Handlers ─────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = {
      title: "Amroding",
      body: event.data.text(),
      icon: "/icons/icon-192x192.png",
      data: { url: "/dashboard" },
    };
  }

  const options = {
    body: data.body || data.message || "You have a new notification",
    icon: data.icon || "/icons/icon-192x192.png",
    badge: data.badge || "/icons/icon-72x72.png",
    vibrate: [100, 50, 100],
    tag: data.data?.type || "default",
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.data?.url || "/dashboard",
      type: data.data?.type || "system",
    },
    actions: [
      { action: "open", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Amroding", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && typeof client.focus === "function") {
          client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
             client.navigate(targetUrl);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
         return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Background Sync Handler ──────────────────────────────────────

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'TRIGGER_SYNC' }));
      })
    );
  }
});
