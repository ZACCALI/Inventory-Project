export const APP_NAME = 'Amroding General Merchandise';
export const CURRENCY = '₱';
export const CURRENCY_CODE = 'PHP';

export function formatCurrency(amount: number | null | undefined): string {
  const validAmount = amount ?? 0;
  return `${CURRENCY}${validAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateOrderNumber(orderType?: string, isDelivery?: boolean): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  
  let prefix = 'HOME';
  if (orderType === 'pos' || orderType === 'store') {
    prefix = 'STORE';
  } else if (isDelivery) {
    prefix = 'DELIVERY';
  } else {
    prefix = 'WALKIN';
  }
  
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${year}${month}${day}-${hours}${minutes}${seconds}-${rand}`;
}

export function generateSKU(category: string, name: string): string {
  const catPrefix = category.substring(0, 3).toUpperCase();
  const namePrefix = name.substring(0, 3).toUpperCase();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${catPrefix}-${namePrefix}-${random}`;
}

export const ORDER_STATUSES = ['pending', 'confirmed', 'delivered', 'cancelled'] as const;
export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'] as const;
export const DELIVERY_STATUSES = ['pending', 'in_transit', 'delivered', 'failed', 'cancelled'] as const;
export const USER_ROLES = ['admin', 'staff', 'cashier'] as const;
export const STOCK_TYPES = ['IN', 'OUT'] as const;

export type OrderStatus = typeof ORDER_STATUSES[number];
export type PaymentStatus = typeof PAYMENT_STATUSES[number];
export type DeliveryStatus = typeof DELIVERY_STATUSES[number];
export type UserRole = typeof USER_ROLES[number];
export type StockType = typeof STOCK_TYPES[number];

export const ORDER_TYPE_LABELS: Record<string, string> = {
  wholesale: 'Walk in Home',
  pos: 'Walk in Store',
};


export const STOCK_SOURCE_LABELS = {

  WALK_IN_HOME: 'Walk in Home',
  WALK_IN_STORE: 'Walk in Store',
  MANUAL: 'Manual',
  RECEIVE: 'Receive',
} as const;

// Singleton BroadcastChannel for efficient cross-tab communication
let _broadcastChannel: BroadcastChannel | null = null;
function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_broadcastChannel) {
      _broadcastChannel = new BroadcastChannel('amroding-sync-channel');
    }
    return _broadcastChannel;
  } catch {
    return null;
  }
}

/**
 * Dispatches a global event so that all open modules instantly refresh their SWR state.
 * Also uses a BroadcastChannel to notify other open tabs of the change.
 */
export function broadcastDataChange(entity?: string) {
  if (typeof window !== 'undefined') {
    const detail = { entity, timestamp: Date.now() };
    
    // Dispatch locally in the current tab
    window.dispatchEvent(new CustomEvent('amroding:data-changed', { detail }));
    window.dispatchEvent(new Event('appDataSynced'));
    window.dispatchEvent(new Event('amroding:synced'));
    
    // Dispatch to other open tabs using singleton channel
    try {
      const channel = getBroadcastChannel();
      if (channel) {
        channel.postMessage({ type: 'DATA_CHANGED', detail });
      }
    } catch (e) { /* ignore */ }
  }
}
