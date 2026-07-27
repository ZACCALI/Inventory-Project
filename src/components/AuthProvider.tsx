'use client';

import { SessionProvider } from 'next-auth/react';
import React, { useEffect } from 'react';
import { SWRConfig, useSWRConfig } from 'swr';

function GlobalSWRListener({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const handleDataChange = () => {
      // Revalidate all active SWR keys in cache instantly
      mutate(
        () => true,
        undefined,
        { revalidate: true }
      );
    };

    window.addEventListener('amroding:data-changed', handleDataChange);
    window.addEventListener('appDataSynced', handleDataChange);
    window.addEventListener('amroding:synced', handleDataChange);

    return () => {
      window.removeEventListener('amroding:data-changed', handleDataChange);
      window.removeEventListener('appDataSynced', handleDataChange);
      window.removeEventListener('amroding:synced', handleDataChange);
    };
  }, [mutate]);

  return <>{children}</>;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <SWRConfig value={{ revalidateOnFocus: true, revalidateOnReconnect: true }}>
        <GlobalSWRListener>
          {children}
        </GlobalSWRListener>
      </SWRConfig>
    </SessionProvider>
  );
}
