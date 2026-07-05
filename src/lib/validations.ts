import { z } from 'zod';

// ============================================================
//  Shared Helpers
// ============================================================

/** Trims and strips HTML tags from a string for XSS prevention */
const safeString = (maxLen = 500) =>
  z.string().trim().max(maxLen).transform((s) => s.replace(/<[^>]*>/g, ''));

const safeOptionalString = (maxLen = 500) =>
  z.string().trim().max(maxLen).transform((s) => s.replace(/<[^>]*>/g, '')).optional().or(z.literal(''));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const positiveNumber = z.number().positive('Must be greater than 0');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const nonNegativeNumber = z.number().min(0, 'Cannot be negative');

// ============================================================
//  Password Policy
// ============================================================

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character (!@#$%^&*)');

// ============================================================
//  Products
// ============================================================

const uomSchema = z.object({
  id: z.string().optional(),
  name: safeString(100),
  barcode: safeOptionalString(100).or(z.literal(null)).default(''),
  multiplier: z.coerce.number().int().min(1, 'Multiplier must be at least 1').default(1),
  price: z.coerce.number().min(0, 'Price cannot be negative').default(0),
  isBase: z.boolean().optional(),
});

const baseProductSchema = z.object({
  name: safeString(200),
  sku: safeString(100),
  barcode: safeOptionalString(100).or(z.literal(null)),
  price: z.preprocess((val) => (val === '' ? undefined : val), z.coerce.number().min(0, 'Price cannot be negative')),
  costPrice: z.coerce.number().min(0, 'Cost price cannot be negative'),
  stock: z.coerce.number().int().min(0),
  minStock: z.coerce.number().int().min(0),
  unit: safeString(50),
  expiryDate: z.string().optional().or(z.literal('')),
  image: z.string().max(2800000, 'Image exceeds 2MB limit').optional().or(z.literal(null)),
  categoryId: z.string().optional(),
  uoms: z.array(uomSchema),
});

export const createProductSchema = baseProductSchema.extend({
  barcode: safeOptionalString(100).or(z.literal(null)).default(null),
  costPrice: z.coerce.number().min(0, 'Cost price cannot be negative').default(0),
  stock: z.coerce.number().int().min(0).default(0),
  minStock: z.coerce.number().int().min(0).default(0),
  unit: safeString(50).default('pcs'),
  uoms: z.array(uomSchema).default([]),
});

export const updateProductSchema = baseProductSchema.partial().extend({
  isArchived: z.boolean().optional(),
});

// ============================================================
//  Stock Movements
// ============================================================

export const createStockMovementSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  type: z.enum(['IN', 'OUT'], { message: 'Type must be IN or OUT' }),
  quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
  reason: safeOptionalString(500).default(''),
  source: z
    .enum(['MANUAL', 'RECEIVE', 'WALK_IN_HOME', 'WALK_IN_STORE', 'AUDIT', 'EXPIRY_TRACKING'])
    .default('MANUAL'),
  expiryDate: z.string().optional().or(z.literal('')),
  forceBatchId: z.string().optional(),
  batchNumber: safeOptionalString(100).default(''),
  targetBatchId: z.string().optional(),
});

export const updateStockMovementSchema = z.object({
  quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
  reason: safeString(500),
  expiryDate: z.string().optional().or(z.literal('')),
});

// ============================================================
//  Orders
// ============================================================

const orderItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().int().positive('Quantity must be greater than 0').optional(),
  quantity: z.coerce.number().int().positive().optional(),
  price: z.preprocess((val) => (val === '' ? undefined : val), z.coerce.number().min(0, 'Price cannot be negative')),
  uomName: z.string().optional().or(z.literal(null)),
  multiplier: z.coerce.number().int().min(1).optional(),
});

export const createOrderSchema = z.object({
  customerId: z.string().optional(),
  customerName: safeOptionalString(200),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  notes: safeOptionalString(1000),
  orderReference: safeOptionalString(200),
  discount: z.coerce.number().min(0, 'Discount cannot be negative').default(0),
  orderType: z.enum(['wholesale', 'retail', 'walk-in', 'pos']).default('wholesale'),
  status: z.enum(['pending', 'confirmed', 'delivered', 'cancelled']).default('pending'),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).default('unpaid'),
  isDelivery: z.boolean().optional(),
  deliveryDriverId: z.string().optional(),
  deliveryDriverName: safeOptionalString(200),
  deliveryDate: z.string().optional().or(z.literal('')),
  orderDate: z.string().optional().or(z.literal('')),
  isOfflineSync: z.boolean().optional(),
});

export const updateOrderSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'delivered', 'cancelled']).optional(),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
  notes: safeOptionalString(1000),
  items: z.array(orderItemSchema).optional(),
  discount: z.coerce.number().min(0, 'Discount cannot be negative').optional(),
  isArchived: z.boolean().optional(),
  deliveryDriverName: safeOptionalString(200),
  deliveryDate: z.string().optional().or(z.literal('')),
});

// ============================================================
//  Users
// ============================================================

export const createUserSchema = z.object({
  name: safeString(200),
  email: z.string().email('Invalid email address').max(200).trim().toLowerCase(),
  password: passwordSchema,
  role: z.enum(['admin', 'staff', 'cashier'], { message: 'Invalid role' }),
});

export const updateUserSchema = z.object({
  name: safeString(200),
  email: z.string().email('Invalid email address').max(200).trim().toLowerCase(),
  role: z.enum(['admin', 'staff', 'cashier']).optional(),
  password: passwordSchema.optional().or(z.literal('')),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

// ============================================================
//  Customers
// ============================================================

export const customerSchema = z.object({
  name: safeString(200),
  contactPerson: safeOptionalString(200),
  phone: safeOptionalString(50),
  email: z.string().email().max(200).trim().optional().or(z.literal('')),
  address: safeOptionalString(500),
  customerType: z.enum(['wholesale', 'retail', 'walk-in']).default('wholesale'),
});

// ============================================================
//  Categories
// ============================================================

export const categorySchema = z.object({
  name: safeString(100),
  description: safeOptionalString(500),
});

// ============================================================
//  Delivery
// ============================================================

export const createDeliverySchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  driverName: safeOptionalString(200),
  driverPhone: safeOptionalString(50),
  scheduledDate: z.string().optional().or(z.literal('')),
});

export const updateDeliverySchema = z.object({
  status: z.enum(['pending', 'in_transit', 'delivered', 'failed', 'cancelled']).optional(),
  driverId: z.string().optional(),
  driverName: safeOptionalString(200),
  driverPhone: safeOptionalString(50),
  proofPhoto: z.string().max(2800000, 'Proof photo exceeds 2MB limit').optional().or(z.literal(null)),
  deliveredAt: z.string().optional().or(z.literal('')),
});

// ============================================================
//  Expenses
// ============================================================

export const expenseSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  category: safeString(100),
  description: safeString(500),
  reference: safeOptionalString(200),
  date: z.string().optional().or(z.literal('')),
});

// ============================================================
//  Drivers
// ============================================================

export const driverSchema = z.object({
  name: safeString(200),
  phone: safeOptionalString(50).or(z.literal(null)),
  vehicleInfo: safeOptionalString(200).or(z.literal(null)),
  status: z.enum(['active', 'inactive']).optional(),
});

// ============================================================
//  Settings
// ============================================================

const VALID_MODULES = ['inventory', 'orders', 'delivery', 'customers', 'reports', 'expenses', 'stock', 'drivers', 'history'] as const;

export const settingsSchema = z.object({
  companyName: safeOptionalString(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: safeOptionalString(50),
  address: safeOptionalString(500),
  currency: safeOptionalString(10),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  cleanupMode: z.boolean().optional(),
  lockProductDelete: z.boolean().optional(),
  lockProductEdit: z.boolean().optional(),
  lockOrderDelete: z.boolean().optional(),
  lockOrderEdit: z.boolean().optional(),
  lockOrderCancel: z.boolean().optional(),
  lockOrderDate: z.boolean().optional(),
  lockStockVoid: z.boolean().optional(),
  expiryWarningDays: z.coerce.number().int().min(1).max(365).default(30),
  staffPermissions: z
    .string()
    .refine(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s) => s.split(',').every((p) => VALID_MODULES.includes(p.trim() as any) || p.trim() === ''),
      'Invalid permission module'
    )
    .optional(),
  cashierPermissions: z
    .string()
    .refine(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s) => s.split(',').every((p) => VALID_MODULES.includes(p.trim() as any) || p.trim() === ''),
      'Invalid permission module'
    )
    .optional(),
  stockInReasons: z.string().optional(),
  stockOutReasons: z.string().optional(),
  expenseCategories: z.string().optional(),
});

// ============================================================
//  Batches
// ============================================================

export const updateBatchSchema = z.object({
  expiryDate: z.string().optional().or(z.literal('')).or(z.literal(null)),
  batchNumber: safeOptionalString(100).or(z.literal(null)),
});

// ============================================================
//  References / Units
// ============================================================

export const referenceSchema = z.object({
  name: safeString(200),
});
