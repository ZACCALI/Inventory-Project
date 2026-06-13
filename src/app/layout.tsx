import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import AppShell from '@/components/layout/AppShell';
import { AlertProvider } from '@/components/AlertModal';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2563EB',
};

export const metadata: Metadata = {
  title: 'Amroding General Merchandise — Inventory Management',
  description: 'Modern inventory and order management system',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icons/icon-192x192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Amroding General Merchandise',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AlertProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </AlertProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
