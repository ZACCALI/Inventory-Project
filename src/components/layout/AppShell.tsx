'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { Truck, CloudOff } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import { db } from '@/lib/db';
import { loadPrinterConfig } from '@/lib/qzService';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [cachedSession, setCachedSession] = useState<any>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('amroding_cached_session');
      if (saved) setCachedSession(JSON.parse(saved));
    } catch (e) {}

    // Hydrate printer config on startup (restores from DB if local storage was cleared)
    loadPrinterConfig().catch(console.error);
  }, []);
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [settings, setSettings] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  useEffect(() => {
    if (session) {
      try {
        localStorage.setItem('amroding_cached_session', JSON.stringify(session));
        setCachedSession(session);
      } catch (e) {
        console.error(e);
      }
    }
  }, [session]);

  const activeSession = session || cachedSession;
  const userRole = (activeSession?.user as { role?: string })?.role;

  // Public pages that don't require auth
  const isPublicPage = pathname === '/login' || pathname === '/';

  // Redirect to login if not authenticated (skip public pages)
  useEffect(() => {
    if (status === 'unauthenticated' && !isPublicPage) {
      if (!isOnline || cachedSession) return;
      
      // Ping check to avoid redirecting if just network throttled
      fetch(`/api/test-ping?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' })
        .then(() => {
          router.push('/login');
        })
        .catch(() => {
          console.warn("AppShell: Cannot reach server, ignoring unauthenticated status.");
        });
    }
  }, [status, pathname, router, isPublicPage, isOnline, cachedSession]);

  // Fetch settings once per session
  useEffect(() => {
    if (activeSession && !settings) {
      fetch('/api/settings')
        .then(res => {
          if (!res.ok) throw new Error('Settings fetch failed');
          return res.json();
        })
        .then(data => setSettings(data))
        .catch(async err => {
          console.error('Failed to fetch settings for permissions, checking local cache', err);
          try {
            const cached = await db.settings.get('current');
            if (cached?.data) {
              setSettings(JSON.parse(cached.data));
              return;
            }
          } catch (dexieErr) {
            console.error('Failed to read settings from Dexie cache', dexieErr);
          }
          // Set a fallback to avoid infinite loading on offline mode
          setSettings({}); 
        });
    }
  }, [activeSession, settings]);

  // Global fix: Prevent mouse scroll from changing number inputs
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (document.activeElement === target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
        (target as HTMLInputElement).blur();
      }
    };
    
    // Use capture phase to catch it before it processes
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // Dynamic Route Protection
  useEffect(() => {
    if (!settings || !userRole || userRole === 'admin' || isPublicPage) return;

    const permissionsStr = userRole === 'staff' ? settings.staffPermissions : settings.cashierPermissions;
    const permissions = permissionsStr ? permissionsStr.split(',').map((s: string) => s.trim()) : [];

    const pathMappings: Record<string, string> = {
      '/inventory': 'inventory',
      '/delivery': 'delivery',
      '/drivers': 'drivers',
      '/customers': 'customers',
      '/orders': 'orders',
      '/expenses': 'finances', 
      '/reports': 'reports',
      '/users': 'users',
      '/history': 'history',
    };

    const currentBaseRoute = Object.keys(pathMappings).find(route => pathname.startsWith(route));
    if (currentBaseRoute) {
      const requiredPermission = pathMappings[currentBaseRoute];
      if (['finances', 'reports', 'users'].includes(requiredPermission)) {
        router.push('/dashboard');
      } else if (!permissions.includes(requiredPermission)) {
        router.push('/dashboard');
      }
    }
  }, [pathname, settings, userRole, isPublicPage, router]);

  // Don't show shell on public pages
  if (isPublicPage) {
    return <>{children}</>;
  }

  // Show loading state while checking auth or loading dynamic permissions
  const isLoadingSettings = activeSession && userRole !== 'admin' && !settings;
  if ((status === 'loading' && !activeSession) || isLoadingSettings) {
    return (
        <div className="loading-page" style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-md)' }}>
            <div className="premium-loader-icon" style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', boxShadow: '0 8px 24px rgba(37,99,235,0.35)' }}>
              <Truck size={32} color="white" />
            </div>
            <p className="premium-loader-text" style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: 'var(--font-md)', letterSpacing: '0.3px' }}>Loading System...</p>
          </div>
        </div>
    );
  }

  // If not authenticated, return null while redirect happens
  if (!activeSession) {
    if (!isOnline) {
      return (
        <div className="loading-page" style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-md)' }}>
            <CloudOff size={48} color="var(--danger)" style={{ opacity: 0.8 }} />
            <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Offline. Please connect to internet to log in.</p>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          className="sidebar-overlay open"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Main Sidebar (Desktop & Mobile) */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        userRole={userRole}
        isOpen={mobileSidebarOpen}
        onNavigate={() => setMobileSidebarOpen(false)}
        permissions={
          userRole === 'admin' ? ['inventory', 'delivery', 'customers', 'orders', 'history'] 
          : (userRole === 'staff' ? settings?.staffPermissions?.split(',')?.map((s:string)=>s.trim()) 
          : settings?.cashierPermissions?.split(',')?.map((s:string)=>s.trim())) || []
        }
      />

      {/* Navbar */}
      <Navbar 
        onMenuToggle={() => {
          if (window.innerWidth <= 768) {
            setMobileSidebarOpen(!mobileSidebarOpen);
          } else {
            setSidebarCollapsed(!sidebarCollapsed);
          }
        }} 
      />

      {/* Main Content */}
      <main className="main-content">
        <div className="page-container">
          {children}
        </div>
      </main>
    </div>
  );
}
