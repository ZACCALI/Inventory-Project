/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { Serwist, NetworkFirst } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const customCache: RuntimeCaching[] = [
  {
    matcher: /\/api\/auth\/session.*/i,
    handler: new NetworkFirst({
      cacheName: "next-auth-session",
    }),
  },
  {
    matcher: /\/api\/settings.*/i,
    handler: new NetworkFirst({
      cacheName: "app-settings",
      matchOptions: {
        ignoreSearch: true,
      }
    }),
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: customCache,
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
      title: "DistriTrack",
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
    self.registration.showNotification(data.title || "DistriTrack", options)
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
