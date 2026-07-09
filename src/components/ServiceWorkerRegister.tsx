'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useSWRConfig } from 'swr';
import { usePrefetchCache } from '@/lib/prefetchCache';

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
 */
async function subscribeToPush(registration: ServiceWorkerRegistration) {
  try {
    if (!('PushManager' in window)) return;
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      await sendSubscriptionToServer(existingSubscription);
      return;
    }
    if (Notification.permission === 'denied') return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const vapidRes = await fetch('/api/push-subscription/vapid-key');
    if (!vapidRes.ok) return;
    const { publicKey } = await vapidRes.json();
    if (!publicKey) return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    await sendSubscriptionToServer(subscription);
  } catch (err) {
    console.error('Push subscription failed:', err);
  }
}

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
  const { mutate } = useSWRConfig();

  // Trigger background cache prefetch after login
  usePrefetchCache();

  // Listen for sync events and invalidate all SWR caches for instant UI refresh
  useEffect(() => {
    const handleSynced = () => {
      // Revalidate all cached SWR keys so every open page refreshes immediately
      mutate(() => true, undefined, { revalidate: true });
    };
    window.addEventListener('distritrack:synced', handleSynced);
    return () => window.removeEventListener('distritrack:synced', handleSynced);
  }, [mutate]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('SW registered:', registration.scope);
          if (session?.user) {
            if (registration.active) {
              subscribeToPush(registration);
            } else {
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
