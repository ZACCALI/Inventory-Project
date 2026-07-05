'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  ScanBarcode,
  AlertTriangle,
  Users,
  ShieldCheck,
  ClipboardList,
  FilePlus,
  Truck,
  BarChart3,
  Settings,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronLeft,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronRight,

  Receipt,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  Menu,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  userRole?: string;
  isOpen?: boolean;
  onNavigate?: () => void;
  permissions?: string[];
}

const getNavItems = (userRole?: string, permissions: string[] = []) => {
  const isAdmin = userRole === 'admin';
  const hasPerm = (p: string) => isAdmin || permissions.includes(p);

  const sections = [];

  // Main is visible to all
  sections.push({
    section: 'Main',
    items: [{ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  });

  // Inventory
  if (hasPerm('inventory')) {
    sections.push({
      section: 'Inventory',
      items: [
        { name: 'Products', href: '/inventory', icon: Package },
        { name: 'Stock In/Out', href: '/inventory/stock', icon: ArrowLeftRight },
        { name: 'Barcode Scanner', href: '/inventory/scan', icon: ScanBarcode },
        { name: 'Expiry Tracking', href: '/inventory/expiry', icon: AlertTriangle },
      ],
    });
  }

  // People
  const peopleItems = [];
  if (hasPerm('customers')) peopleItems.push({ name: 'Customers', href: '/customers', icon: Users });
  if (hasPerm('delivery')) peopleItems.push({ name: 'Delivery Men', href: '/drivers', icon: Truck });
  if (peopleItems.length > 0) {
    sections.push({ section: 'People', items: peopleItems });
  }

  // Sales
  if (hasPerm('orders')) {
    sections.push({
      section: 'Sales',
      items: [
        { name: 'All Orders', href: '/orders', icon: ClipboardList },
        { name: 'Walk in Home', href: '/orders/create', icon: FilePlus },
      ],
    });
  }

  // Logistics
  if (hasPerm('delivery')) {
    sections.push({
      section: 'Logistics',
      items: [{ name: 'Delivery', href: '/delivery', icon: Truck }],
    });
  }

  // Admin / Finance / History
  const adminItems = [];
  if (isAdmin) {
    sections.push({
      section: 'Finance',
      items: [{ name: 'Expenses', href: '/expenses', icon: Receipt }],
    });
    sections.push({
      section: 'Analytics',
      items: [{ name: 'Reports', href: '/reports', icon: BarChart3 }],
    });
    adminItems.push({ name: 'User Management', href: '/users', icon: ShieldCheck });
  }
  
  if (hasPerm('history') || isAdmin) {
    adminItems.push({ name: 'Audit Logs', href: '/history', icon: ClipboardList });
  }

  // Settings is always visible to all users
  adminItems.push({ name: 'Settings', href: '/settings', icon: Settings });

  if (adminItems.length > 0) {
    sections.push({
      section: isAdmin ? 'Admin' : 'System',
      items: adminItems,
    });
  }

  return sections;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function Sidebar({ collapsed, onToggle, userRole, isOpen, onNavigate, permissions }: SidebarProps) {
  const pathname = usePathname();

  const allNavItems = getNavItems(userRole, permissions);

  const allPaths = allNavItems.flatMap(section => section.items.map(i => i.href));
  const bestMatch = allPaths
    .filter(href => pathname === href || pathname.startsWith(href === '/' ? 'INVALID' : href + '/'))
    .sort((a, b) => b.length - a.length)[0] || '/';

  return (
    <>
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${isOpen ? 'open' : ''}`}>

        <nav className="sidebar-nav">
          {allNavItems.map((section) => (
            <div key={section.section} className="nav-section">
              <div className="nav-section-title">{section.section}</div>
              {section.items.map((item) => {
                const isActive = item.href === bestMatch;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    data-tooltip={collapsed ? item.name : undefined}
                    onClick={() => onNavigate?.()}
                  >
                    <item.icon className="nav-icon" size={20} strokeWidth={1.75} />
                    <span className="nav-label">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

      </aside>
    </>
  );
}
