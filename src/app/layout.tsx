import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import AppShell from '@/components/layout/AppShell';
import { AlertProvider } from '@/components/AlertModal';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import NextTopLoader from 'nextjs-toploader';
import { Toaster } from 'react-hot-toast';
import { Plus_Jakarta_Sans } from 'next/font/google';

const plusJakartaSans = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2563EB',
};

export const metadata: Metadata = {
  title: 'Amroding General Merchandise — Inventory Management',
  description: 'Modern inventory and order management system',
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
      <body className={`${plusJakartaSans.className} ${plusJakartaSans.variable}`}>
        <NextTopLoader color="var(--primary)" showSpinner={false} />
        <Toaster position="bottom-right" toastOptions={{
          style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' },
          success: { iconTheme: { primary: 'var(--success)', secondary: '#fff' } },
        }} />
        <AlertProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
            <ServiceWorkerRegister />
          </AuthProvider>
        </AlertProvider>
      </body>
    </html>
  );
}
