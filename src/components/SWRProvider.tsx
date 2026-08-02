'use client';

import { useEffect } from 'react';
import { SWRConfig, useSWRConfig } from 'swr';
import { broadcastDataChange } from '@/lib/constants';

function GlobalSWRListeners({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const handleDataChange = () => {
      // Revalidate all active SWR keys instantly
      mutate(
        () => true,
        undefined,
        { revalidate: true }
      );
    };

    window.addEventListener('amroding:data-changed', handleDataChange);
    window.addEventListener('appDataSynced', handleDataChange);
    window.addEventListener('amroding:synced', handleDataChange);

    // Listen to other tabs
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('amroding-sync-channel');
      channel.onmessage = (event) => {
        if (event.data?.type === 'DATA_CHANGED') {
          handleDataChange();
        }
      };
    } catch {}

    // Global interceptor for all API mutations to broadcast changes immediately
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.ok) {
        const fetchMethod = (args[1]?.method || 'GET').toUpperCase();
        const fetchUrl = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(fetchMethod) && fetchUrl.includes('/api/')) {
           const init = args[1];
           const isOfflineSync = (init?.headers as Record<string,string>)?.['X-Offline-Sync'] === '1';
           if (!isOfflineSync) {
             // Schedule broadcast to happen right after the current execution stack finishes
             setTimeout(() => broadcastDataChange('api_mutation'), 0);
           }
        }
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener('amroding:data-changed', handleDataChange);
      window.removeEventListener('appDataSynced', handleDataChange);
      window.removeEventListener('amroding:synced', handleDataChange);
      if (channel) channel.close();
    };
  }, [mutate]);

  return <>{children}</>;
}

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
      }}
    >
      <GlobalSWRListeners>
        {children}
      </GlobalSWRListeners>
    </SWRConfig>
  );
}
