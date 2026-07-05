'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

/**
 * Converts a base64 URL-encoded string to a Uint8Array.
 * Required for the applicationServerKey in push subscription.
 */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

/**
 * Subscribe to push notifications after service worker registration.
 * Requests permission, subscribes via VAPID, and sends subscription to server.
 */
async function subscribeToPush(registration: ServiceWorkerRegistration) {
  try {
    // Check if push is supported
    if (!('PushManager' in window)) {
      console.log('Push notifications not supported');
      return;
    }

    // Check if already subscribed
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      // Already subscribed — ensure server knows about it
      await sendSubscriptionToServer(existingSubscription);
      return;
    }

    // Check if permission is already denied to avoid browser warnings
    if (Notification.permission === 'denied') {
      return;
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return;
    }

    // Fetch VAPID public key from server
    const vapidRes = await fetch('/api/push-subscription/vapid-key');
    if (!vapidRes.ok) {
      console.log('Push not configured on server');
      return;
    }
    const { publicKey } = await vapidRes.json();
    if (!publicKey) return;

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    // Send subscription to server
    await sendSubscriptionToServer(subscription);
    console.log('Push notification subscription successful');
  } catch (err) {
    console.error('Push subscription failed:', err);
  }
}

/**
 * Send the push subscription to the server for storage.
 */
async function sendSubscriptionToServer(subscription: PushSubscription) {
  try {
    await fetch('/api/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });
  } catch (err) {
    console.error('Failed to send subscription to server:', err);
  }
}

export default function ServiceWorkerRegister() {
  const { data: session } = useSession();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('SW registered:', registration.scope);

          // Only subscribe to push if user is logged in
          if (session?.user) {
            // Wait for the service worker to be ready
            if (registration.active) {
              subscribeToPush(registration);
            } else {
              // Wait for the service worker to activate
              registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (newWorker) {
                  newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'activated') {
                      subscribeToPush(registration);
                    }
                  });
                }
              });
            }
          }
        })
        .catch((err) => {
          console.log('SW registration failed:', err);
        });
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  return null;
}
