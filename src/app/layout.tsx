import type { Metadata } from 'next';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import AppShell from '@/components/layout/AppShell';
import { AlertProvider } from '@/components/AlertModal';

export const metadata: Metadata = {
  title: 'Amroding General Merchandise — Inventory Management',
  description: 'Modern inventory and order management system',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
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
      </body>
    </html>
  );
}
