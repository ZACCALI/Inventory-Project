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

export function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ORD-${year}${month}${day}-${random}`;
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

