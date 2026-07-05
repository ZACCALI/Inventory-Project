'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Menu,
  LogOut,
  User,
  ChevronDown,
  Truck,
  Clock,
  AlertTriangle,
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle,
  X,
  Info
} from 'lucide-react';
import { db } from '@/lib/db';
import { processSyncQueue } from '@/lib/offlineSync';
import Link from 'next/link';

import Image from "next/image";
// ── Fix #11: Proper TypeScript interface ──────────────────────
interface NotificationItem {
  id: string;
  type: 'low_stock' | 'expiry' | 'delivery' | 'system';
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

interface NavbarProps {
  onMenuToggle: () => void;
}

function getRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString();
}

export default function Navbar({ onMenuToggle }: NavbarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>('granted');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [companyName, setCompanyName] = useState('Loading...');
  const [isOffline, setIsOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Monitor Offline Status & Sync Queue
  useEffect(() => {
    const checkOnlineStatus = () => {
      setIsOffline(!navigator.onLine);
      if (navigator.onLine) {
        handleBackgroundSync();
      }
    };

    const countPending = async () => {
      try {
        const count = await db.syncQueue.where('syncStatus').anyOf(['pending', 'failed']).count();
        setPendingSyncCount(count);
      } catch(e) {}
    };

    const handleBackgroundSync = async () => {
      if (isSyncing) return;
      setIsSyncing(true);
      try {
        await processSyncQueue();
        await countPending();
      } catch(e) {}
      setIsSyncing(false);
    };

    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);
    checkOnlineStatus();
    countPending();

    // Poll queue size periodically
    const syncInterval = setInterval(countPending, 5000);
    return () => {
      window.removeEventListener('online', checkOnlineStatus);
      window.removeEventListener('offline', checkOnlineStatus);
      clearInterval(syncInterval);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  const requestPushPermission = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          const vapidRes = await fetch('/api/push-subscription/vapid-key');
          if (!vapidRes.ok) return;
          const { publicKey } = await vapidRes.json();
          
          const urlBase64ToUint8Array = (base64String: string) => {
            const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
              outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray.buffer;
          };

          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          });

          await fetch('/api/push-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: subscription.toJSON() })
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const fetchSettings = () => {
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => setCompanyName(data.companyName || 'Amroding General Merchandise'))
        .catch(() => setCompanyName('Amroding General Merchandise'));
    };

    fetchSettings();

    window.addEventListener('settingsUpdated', fetchSettings);
    return () => window.removeEventListener('settingsUpdated', fetchSettings);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationsOpen]);

  useEffect(() => {
    if (!session?.user) return;
    
    const fetchNotifications = async () => {
      try {
        // Sync new notifications first
        await fetch('/api/notifications/sync');
        // Fetch current notifications
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          setNotifications(data);
        }
      } catch (err) {
        console.error('Failed to fetch notifications', err);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const handleMarkAllRead = useCallback(async () => {
    // Only fire if there are actually unread notifications
    const hasUnread = notifications.some(n => !n.isRead);
    if (!hasUnread) return;

    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' })
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  }, [notifications]);

  const handleMarkAsReadIndividual = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', notificationId: id })
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDismiss = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // prevent clicking the notification body
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', notificationId: id })
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss_all' })
      });
      setNotifications([]);
    } catch (err) {
      console.error(err);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Memoize unread count so it's not recalculated on every render
  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  return (
    <header className="navbar">
      <div className="navbar-left">
        <button className="menu-toggle" onClick={onMenuToggle}>
          <Menu size={22} strokeWidth={1.75} />
        </button>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', overflow: 'hidden' }}>
          <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
            <Truck size={20} strokeWidth={1.5} />
          </div>
          <span className="system-name" style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{companyName}</span>
        </Link>
        <div className="navbar-greeting" style={{ marginLeft: '16px', display: 'none' }}>
          {getGreeting()}, <strong>{session?.user?.name || 'User'}</strong>
        </div>
      </div>

      <div className="navbar-right">
        {/* Sync Status Indicator */}
        <div 
          className={!isOffline && !isSyncing && pendingSyncCount === 0 ? 'hide-mobile' : ''}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '8px', cursor: pendingSyncCount > 0 && !isOffline ? 'pointer' : 'default' }}
          onClick={() => { if (pendingSyncCount > 0 && !isOffline && !isSyncing) processSyncQueue(); }}
          title={isOffline ? 'Offline Mode' : isSyncing ? 'Syncing to Cloud...' : pendingSyncCount > 0 ? `${pendingSyncCount} items waiting to sync` : 'Cloud Sync Active'}
        >
          {isOffline ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--warning)', background: 'var(--warning-light)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
              <CloudOff size={14} /> <span className="hide-mobile">Offline Mode</span>
            </div>
          ) : isSyncing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', background: 'var(--primary-light)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
              <RefreshCw size={14} className="spin-animation" /> <span className="hide-mobile">Syncing...</span>
            </div>
          ) : pendingSyncCount > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--warning)', background: 'var(--warning-light)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
              <Cloud size={14} /> <span className="hide-mobile">{pendingSyncCount} Pending</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--success)', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
              <CheckCircle size={14} /> <span className="hide-mobile">Synced</span>
            </div>
          )}
        </div>

        <div className="notification-wrapper" ref={notificationsRef} style={{ position: 'relative' }}>
          <button 
            className={`notification-btn ${notificationsOpen ? 'active' : ''}`}
            data-tooltip="Notifications"
            data-tooltip-position="bottom"
            data-tooltip-align="right"
            onClick={() => {
              const willOpen = !notificationsOpen;
              setNotificationsOpen(willOpen);
              if (willOpen && unreadCount > 0) {
                handleMarkAllRead();
              }
            }}
          >
            <Bell size={20} strokeWidth={1.75} />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
          </button>

          {notificationsOpen && (
            <div className="dropdown-menu notification-dropdown">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Notifications
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {notifications.length > 0 && (
                    <button 
                      onClick={handleClearAll}
                      style={{ fontSize: '11px', color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                    >
                      Clear All
                    </button>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                    {notifications.length} {notifications.length === 1 ? 'alert' : 'alerts'}
                  </span>
                </div>
              </div>
              
              {pushPermission === 'default' && (
                <div style={{ padding: '12px 16px', background: 'var(--bg-main)', borderBottom: '1px solid var(--border-light)' }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Enable browser notifications to stay updated instantly.
                  </p>
                  <button 
                    onClick={requestPushPermission}
                    style={{ width: '100%', padding: '8px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                  >
                    Enable Notifications
                  </button>
                </div>
              )}

              <div className="notification-list">
                {notifications.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    <Bell size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                    <p style={{ fontSize: 'var(--font-sm)' }}>No new notifications</p>
                    <p style={{ fontSize: '12px', marginTop: '4px' }}>You&apos;re all caught up!</p>
                  </div>
                ) : (
                  notifications.map(notif => (
                    <div key={notif.id} className={`notification-item-container ${!notif.isRead ? 'unread' : ''}`} style={{ position: 'relative' }}>
                      <button className="notification-item" onClick={() => { 
                          if (!notif.isRead) handleMarkAsReadIndividual(notif.id);
                          setNotificationsOpen(false); 
                          router.push(notif.link || '/dashboard'); 
                        }} style={{ width: '100%', textAlign: 'left' }}>
                        <div className={`notification-icon ${notif.type}`}>
                          {notif.type === 'low_stock' && <AlertTriangle size={16} />}
                          {notif.type === 'expiry' && <Clock size={16} />}
                          {notif.type === 'delivery' && <Truck size={16} />}
                          {notif.type === 'system' && <Info size={16} />}
                        </div>
                        <div className="notification-content" style={{ paddingRight: '24px' }}>
                          <div className="notification-title">{notif.title}</div>
                          <div className="notification-message">{notif.message}</div>
                          <div className="notification-time">{getRelativeTime(notif.createdAt)}</div>
                        </div>
                      </button>
                      <button 
                        onClick={(e) => handleDismiss(e, notif.id)}
                        className="notification-dismiss-btn"
                        title="Dismiss"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              

            </div>
          )}
        </div>

        <div className="user-dropdown" ref={dropdownRef}>
          <button
            className="navbar-profile-btn"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            {(session?.user as { avatar?: string })?.avatar ? (
              <Image width={400} height={400} src={(session?.user as { avatar?: string }).avatar || '/icon.svg'} alt="Avatar" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <span className="navbar-avatar-circle">
                {session?.user?.name ? getInitials(session.user.name) : 'U'}
              </span>
            )}
            <span className="admin-name" style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-family)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>
              {session?.user?.name || 'User'}
            </span>
            <ChevronDown size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          </button>

          {dropdownOpen && (
            <div className="dropdown-menu">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {session?.user?.name}
                </div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>
                  {session?.user?.email}
                </div>
                <span className="badge badge-primary" style={{ marginTop: '4px' }}>
                  {(session?.user as { role?: string })?.role || 'user'}
                </span>
              </div>
              <button className="dropdown-item" onClick={() => { setDropdownOpen(false); router.push('/settings'); }}>
                <User size={16} strokeWidth={1.75} />
                Profile & Settings
              </button>
              <div className="dropdown-divider" />
              <button
                className="dropdown-item danger"
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut size={16} strokeWidth={1.75} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
