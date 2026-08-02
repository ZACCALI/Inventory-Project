'use client';

import { SessionProvider } from 'next-auth/react';
import React from 'react';
import { SWRConfig } from 'swr';



export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <SWRConfig value={{ revalidateOnFocus: true, revalidateOnReconnect: true }}>
        {children}
      </SWRConfig>
    </SessionProvider>
  );
}
