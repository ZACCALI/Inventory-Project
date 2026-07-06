'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Search, Plus, Trash2, Save, ShoppingBag, User,  X, Truck, CheckCircle2, AlertCircle, Minus, Camera, ScanLine, Receipt, Printer, ShoppingCart,       AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { Html5Qrcode } from 'html5-qrcode';
import { useBarcodeScanner } from '@/lib/useBarcodeScanner';
import { addSyncTask } from '@/lib/offlineSync';

import Image from "next/image";
interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  costPrice: number;
  stock: number;
  image: string | null;
  category: { name: string } | null;
  uoms?: { id: string; name: string; barcode: string | null; multiplier: number; price: number; isBase: boolean }[];
  unit: string;
}

interface CartItem {
  id: string;
  product: Product;
  qty: number | '';
  uomName?: string | null;
  multiplier?: number;
  cartPrice: number;
}

export default function CreateOrderPage() {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id || 'clv123mockuserid0001';
  const isAdmin = session?.user?.role?.toLowerCase() === 'admin';

  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [customers, setCustomers] = useState<{id: string, name: string, customerType?: string}[]>([]);
  const [drivers, setDrivers] = useState<{id: string, name: string}[]>([]);
  const [showConfirmCheckout, setShowConfirmCheckout] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [lockOrderDate, setLockOrderDate] = useState(true);
  const [companyName, setCompanyName] = useState('Amroding General Merchandise');

  // Order Details State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [fulfillmentMode, setFulfillmentMode] = useState<'walkin' | 'delivery'>('delivery');
  const [orderStatus, setOrderStatus] = useState('pending');
 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isDelivery, setIsDelivery] = useState(false);
  const [deliveryDriverId, setDeliveryDriverId] = useState('');
  const [deliveryDriverName, setDeliveryDriverName] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');

  // Auto-set logical order status when fulfillment mode changes
  useEffect(() => {
    setOrderStatus(fulfillmentMode === 'delivery' ? 'pending' : 'delivered');
  }, [fulfillmentMode]);

  // Cart & Search State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedProductForUom, setSelectedProductForUom] = useState<Product | null>(null);
  
  // Payment State
  const [paymentStatus, setPaymentStatus] = useState('unpaid');
  const [amountPaid, setAmountPaid] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isViewItemsOpen, setIsViewItemsOpen] = useState(false);
  
  // Success Modal & Receipt State
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lastOrder, setLastOrder] = useState<any>(null);

  // Toast State
  const [toastMessage, setToastMessage] = useState<{ message: string, type: 'success' | 'error' | 'warning' } | null>(null);

  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setPausedState] = useState(false);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Clean up hardware scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.stop().catch(() => {});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch(e) {}
      }
    };
  }, []);

  const { isReady: isHardwareScannerReady } = useBarcodeScanner({ onScan: (scannedBarcode: string) => {
    if (isScanning) return;
    const product = products.find(p => p.barcode === scannedBarcode || p.sku === scannedBarcode || p.uoms?.some(u => u.barcode === scannedBarcode));
    if (product) {
      if (product.stock > 0) {
        const matchedUom = product.uoms?.find(u => u.barcode === scannedBarcode);
        const isBaseBarcode = product.barcode === scannedBarcode || product.sku === scannedBarcode;
        if (matchedUom) {
           addToCart(product, scannedBarcode);
        } else if (isBaseBarcode) {
           addToCart(product);
        } else if (product.uoms && product.uoms.length > 0) {
           setSelectedProductForUom(product);
        } else {
           addToCart(product);
        }
      } else {
        showToast("Out of stock", "error");
      }
    } else {
      showToast("Barcode not found", "error");
    }
  } });

  async function startScanner() {
      if (isScanning) return stopScanner();
      try {
        setIsScanning(true);
        setPausedState(false);
      
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        throw new Error("No cameras found on this device.");
      }

      const scanner = new Html5Qrcode("pos-reader");
      scannerRef.current = scanner;
      
        await scanner.start(
          { facingMode: "environment" },
          { fps: 15, qrbox: { width: 300, height: 200 }, aspectRatio: 1.0 },
          (decodedText) => {
            if (isPausedRef.current) return;
            const now = Date.now();
            if (lastScannedCodeRef.current === decodedText && now - lastScannedTimeRef.current < 1000) {
              return;
            }
            lastScannedCodeRef.current = decodedText;
            lastScannedTimeRef.current = now;
            setPausedState(true);
            setTimeout(() => setPausedState(false), 800);

            const product = products.find(p => p.barcode === decodedText || p.sku === decodedText || p.uoms?.some(u => u.barcode === decodedText));
            if (product) {
              if (product.stock > 0) {
                const matchedUom = product.uoms?.find(u => u.barcode === decodedText);
                const isBaseBarcode = product.barcode === decodedText || product.sku === decodedText;
                if (matchedUom) {
                   addToCart(product, decodedText);
                } else if (isBaseBarcode) {
                   addToCart(product);
                } else if (product.uoms && product.uoms.length > 0) {
                   setSelectedProductForUom(product);
                } else {
                   addToCart(product);
                }
              } else {
                showToast("Out of stock", "error");
              }
            } else {
              console.log("Scanned unknown code: ", decodedText);
            }
          },
          () => {}
        ).catch(async (err) => {
          console.warn("Environment camera failed, falling back to default.", err);
          await scanner.start(
            devices[0].id,
            { fps: 15, qrbox: { width: 300, height: 200 }, aspectRatio: 1.0 },
            (decodedText) => {
              if (isPausedRef.current) return;
              const now = Date.now();
              if (lastScannedCodeRef.current === decodedText && now - lastScannedTimeRef.current < 1000) {
                return;
              }
              lastScannedCodeRef.current = decodedText;
              lastScannedTimeRef.current = now;
              setPausedState(true);
              setTimeout(() => setPausedState(false), 800);

              const product = products.find(p => p.barcode === decodedText || p.sku === decodedText || p.uoms?.some(u => u.barcode === decodedText));
              if (product) {
                if (product.stock > 0) {
                  const matchedUom = product.uoms?.find(u => u.barcode === decodedText);
                  const isBaseBarcode = product.barcode === decodedText || product.sku === decodedText;
                  if (matchedUom) {
                     addToCart(product, decodedText);
                  } else if (isBaseBarcode) {
                     addToCart(product);
                  } else if (product.uoms && product.uoms.length > 0) {
                     setSelectedProductForUom(product);
                  } else {
                     addToCart(product);
                  }
                }
              }
            },
            () => {}
          );
        });
      } catch (err: unknown) {
        console.error(err);
        setIsScanning(false);
        showToast((err as Error).message || 'Camera Error', 'error');
      }
  }

  const stopScanner = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop().then(() => {
          scannerRef.current = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        }).catch((e: any) => {
          if (!e?.toString().includes("not running")) console.error(e);
        });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch(e) {}
    }
    setIsScanning(false);
    setPausedState(false);
  };

  // Load Data
  useEffect(() => {
    const loadData = () => {
      fetch('/api/products?limit=1000').then(res => res.json()).then(data => {
        if (Array.isArray(data)) {
          setProducts(data);
          const cats = Array.from(new Set(data.filter((p: Product) => p.category?.name).map((p: Product) => p.category?.name)));
          setCategories(['All', ...(cats as string[])]);
        }
      });
      fetch('/api/customers?limit=1000').then(res => res.json()).then(data => {
        if (Array.isArray(data)) setCustomers(data);
      });
      fetch('/api/drivers?limit=1000').then(res => res.json()).then(data => {
        if (Array.isArray(data)) setDrivers(data);
      });
      fetch('/api/settings').then(res => res.json()).then(data => {
        if (data && !data.error) {
          setLockOrderDate(data.lockOrderDate ?? true);
          if (data.companyName) setCompanyName(data.companyName);
        }
      });
    };

    loadData();
    const interval = setInterval(loadData, 15000); // Poll every 15 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Auto-select [Normal Walk-in] when switching to Walk-in mode
  useEffect(() => {
    if (fulfillmentMode === 'walkin') {
      const walkInCustomer = customers.find(c => c.name === '[Normal Walk-in]');
      if (walkInCustomer) {
        setSelectedCustomerId(walkInCustomer.id);
      }
    }
  }, [fulfillmentMode, customers]);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const filteredProducts = products.filter(p => {
    const s = search.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(s) || 
                          p.sku.toLowerCase().includes(s) || 
                          (p.barcode && p.barcode.toLowerCase().includes(s));
    const matchesCategory = categoryFilter === 'All' || p.category?.name === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product: Product, scannedBarcode?: string, explicitUomName?: string) => {
    let uomName = null;
    let multiplier = 1;
    let cartPrice = product.price;

    if (scannedBarcode && product.uoms) {
      const matchedUom = product.uoms.find(u => u.barcode === scannedBarcode);
      if (matchedUom) {
        uomName = matchedUom.name;
        multiplier = matchedUom.multiplier;
        cartPrice = matchedUom.price;
      }
    } else if (explicitUomName && product.uoms) {
      const matchedUom = product.uoms.find(u => u.name === explicitUomName);
      if (matchedUom) {
        uomName = matchedUom.name;
        multiplier = matchedUom.multiplier;
        cartPrice = matchedUom.price;
      }
    }

    const currentBaseQtyInCart = cart
      .filter(i => i.product.id === product.id)
      .reduce((sum, i) => sum + (Number(i.qty) || 0) * (i.multiplier || 1), 0);

    if (currentBaseQtyInCart + multiplier > product.stock) {
      showToast(`Cannot add. Stock is only ${product.stock} base units.`, 'error');
      return;
    }

    const existingIndex = cart.findIndex(i => i.product.id === product.id && i.uomName === uomName);
    if (existingIndex >= 0) {
      const newCart = [...cart];
      const [item] = newCart.splice(existingIndex, 1);
      item.qty = (typeof item.qty === 'number' ? item.qty as number : 0) + 1;
      setCart([item, ...newCart]);
    } else {
      setCart([{ 
        id: `${product.id}-${uomName || ''}`,
        product, 
        qty: 1, 
        uomName,
        multiplier,
        cartPrice
      }, ...cart]);
    }
  };

  const updateQty = (productId: string, uomName: string | null | undefined, newQty: number | '', isFromButton = false) => {
    if (newQty === 0 && isFromButton) {
      removeFromCart(productId, uomName);
      return;
    }
    if (newQty !== '' && newQty < 0) return;

    if (newQty !== '') {
      const item = cart.find(i => i.product.id === productId && i.uomName === uomName);
      if (item) {
        const otherBaseQtyInCart = cart
          .filter(i => i.product.id === productId && i.id !== item.id)
          .reduce((sum, i) => sum + (Number(i.qty) || 0) * (i.multiplier || 1), 0);
        
        const maxAllowedQty = Math.floor((item.product.stock - otherBaseQtyInCart) / (item.multiplier || 1));
        if (newQty > maxAllowedQty) {
          showToast(`Maximum available is ${maxAllowedQty}`, 'warning');
          newQty = maxAllowedQty;
        }
      }
    }

    setCart(cart.map(item => (item.product.id === productId && item.uomName === uomName) ? { ...item, qty: newQty } : item));
  };

  const updatePrice = (productId: string, uomName: string | null | undefined, newPrice: number) => {
    if (newPrice < 0) return;
    setCart(cart.map(item => (item.product.id === productId && item.uomName === uomName) ? { ...item, cartPrice: newPrice } : item));
  };

  const removeFromCart = (productId: string, uomName: string | null | undefined) => {
    setCart(cart.filter(item => !(item.product.id === productId && item.uomName === uomName)));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountValue('');
    setShowClearConfirm(false);
  };

  // Calculations
  const totalAmount = cart.reduce((sum, item) => sum + ((typeof item.qty === 'number' ? item.qty : 0) * item.cartPrice), 0);
  
  // Bounds checking on discount
  let parsedDiscount = parseFloat(discountValue) || 0;
  if (parsedDiscount < 0) {
    showToast('Discount cannot be negative.', 'error');
    parsedDiscount = 0;
  }
  if (discountType === 'percent' && parsedDiscount > 100) parsedDiscount = 100;

  const discountAmount = discountType === 'percent' 
    ? totalAmount * (parsedDiscount / 100) 
    : parsedDiscount;
    
  const finalTotal = Math.max(0, totalAmount - discountAmount);
  
  // Payment auto-fill logic
  useEffect(() => {
    if (paymentStatus === 'paid') {
      setAmountPaid(finalTotal.toString());
    } else if (paymentStatus === 'unpaid' || paymentStatus === 'partial') {
      setAmountPaid('');
    }
  }, [paymentStatus, finalTotal]);

  const change = Math.max(0, (parseFloat(amountPaid) || 0) - finalTotal);

  const handleSubmit = async () => {
    if (cart.length === 0) {
      showToast('Cart is empty!', 'error');
      return;
    }

    // Delivery Validation
    if (fulfillmentMode === 'delivery') {
      if (!deliveryDriverName || !deliveryDate) {
        showToast('Driver and Date are required for deliveries!', 'error');
        return;
      }
    }

    // Payment Validation
    const paidAmount = parseFloat(amountPaid) || 0;
    if (['paid', 'partial'].includes(paymentStatus) && paidAmount < finalTotal && paymentStatus === 'paid') {
      showToast('Paid amount must meet or exceed the total for Fully Paid status.', 'error');
      return;
    }
    if (['paid', 'partial'].includes(paymentStatus) && paidAmount > finalTotal + 0.01) {
      showToast('Payment amount cannot exceed the total bill.', 'error');
      return;
    }
    
    setIsSubmitting(true);
    
    // Auto-select Walk-in Customer if none selected
    let customerIdToUse = selectedCustomerId;
    let fallbackCustomerName = null;
    if (!customerIdToUse) {
      const walkIn = customers.find(c => c.name.toLowerCase().includes('walk-in') || c.name.toLowerCase().includes('walk in'));
      if (walkIn) {
        customerIdToUse = walkIn.id;
      } else {
        // Dynamic fallback to create Walk-in if missing
        fallbackCustomerName = 'Walk-in';
      }
    }

    try {
      const validItems = cart.filter(i => typeof i.qty === 'number' && i.qty > 0);
      
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        items: validItems.map(i => ({
          productId: i.product.id,
          quantity: i.qty,
          price: i.cartPrice,
          uomName: i.uomName || undefined,
          multiplier: i.multiplier
        })),
        totalAmount: finalTotal,
        discount: discountAmount, // Backend expects flat absolute amount, which we calculated
        orderType: 'wholesale',
        paymentStatus,
        status: orderStatus,
        isDelivery: fulfillmentMode === 'delivery',
        deliveryDriverId: fulfillmentMode === 'delivery' ? deliveryDriverId : undefined,
        deliveryDriverName: fulfillmentMode === 'delivery' ? deliveryDriverName : undefined,
        deliveryDate: fulfillmentMode === 'delivery' ? (deliveryDate ? new Date(deliveryDate).toISOString() : undefined) : undefined,
        userId,
        notes: undefined
      };

      if (['paid', 'partial'].includes(paymentStatus) && paidAmount > 0) {
        const calculatedBalance = Math.max(0, finalTotal - paidAmount);
        const formatMoney = (val: number) => '?' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        payload.notes = `Paid via Cash (Amount Paid: ${formatMoney(paidAmount)}, Balance: ${formatMoney(calculatedBalance)})`;
      }

      if (customerIdToUse) payload.customerId = customerIdToUse;
      else if (fallbackCustomerName) payload.customerName = fallbackCustomerName;

      let isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            const orderResult = await res.json();
            
            // Save order details for receipt printing
            setLastOrder({
              ...orderResult,
              totalAmount: finalTotal,
              subtotal: totalAmount,
              tendered: paidAmount,
              change: Math.max(0, paidAmount - finalTotal),
              discount: discountAmount,
              discountPercent: discountType === 'percent' ? parsedDiscount : 0,
              items: validItems.map(i => ({ product: i.product, quantity: Number(i.qty), price: i.cartPrice, uomName: i.uomName, multiplier: i.multiplier })),
              createdAt: orderResult.createdAt || new Date().toISOString(),
              createdBy: { name: session?.user?.name || 'ADMIN' }
            });

            // Clear cart and open success modal
            setCart([]);
            setDiscountValue('');
            setAmountPaid('');
            setPaymentStatus('unpaid');
            setIsSubmitting(false);
            setIsSuccessOpen(true);
            return;
          } else {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to create order');
          }
        } catch (fetchErr: any) {
          if (fetchErr.message === 'Failed to fetch' || fetchErr.name === 'TypeError') {
            console.warn('Network error detected, falling back to offline mode', fetchErr);
            networkFailed = true;
          } else {
            throw fetchErr;
          }
        }
      }

      if (isOffline || networkFailed) {
        const localId = await addSyncTask('order', 'CREATE', payload);
        if (!localId) {
          showToast('This exact order is already pending sync.', 'warning');
          setIsSubmitting(false);
          return;
        }

        showToast('Action queued offline — will sync when connected', 'warning');
        
        const offlineOrder = {
          ...payload,
          id: `OFFLINE-${localId}`,
          orderNumber: `OFF-${Math.floor(Math.random() * 100000)}`,
          createdAt: new Date().toISOString(),
        };

        setLastOrder({
          ...offlineOrder,
          totalAmount: finalTotal,
          subtotal: totalAmount,
          tendered: paidAmount,
          change: Math.max(0, paidAmount - finalTotal),
          discount: discountAmount,
          discountPercent: discountType === 'percent' ? parsedDiscount : 0,
          items: validItems.map(i => ({ product: i.product, quantity: Number(i.qty), price: i.cartPrice, uomName: i.uomName, multiplier: i.multiplier })),
          createdBy: { name: session?.user?.name || 'ADMIN' }
        });

        setCart([]);
        setDiscountValue('');
        setAmountPaid('');
        setPaymentStatus('unpaid');
        setIsSubmitting(false);
        setIsSuccessOpen(true);
        return;
      }
    } catch (err: unknown) {
      showToast((err as Error).message, 'error');
      setIsSubmitting(false);
    }
  };

  // ===== RECEIPT PRINTING =====

  const printThermalReceipt = () => {
    if (!lastOrder) return;

    const W = 32;
    const center = (s: string) => { const p = Math.max(0, Math.floor((W - s.length) / 2)); return ' '.repeat(p) + s; };
    const lr = (l: string, r: string) => { const sp = Math.max(1, W - l.length - r.length); return l + ' '.repeat(sp) + r; };
    const D = '--------------------------------';

    const lines: string[] = [
      center(companyName.toUpperCase()),
      center('SARIMANOK ST. MARAWI'),
      center('CITY 2ND BRANCH'),
      center('ALHAMDULILLAH'),
      '',
      'Trx: ' + ((lastOrder.orderNumber || '').split('-').pop() || ''),
      'By: ' + (lastOrder.createdBy?.name || 'ADMIN').substring(0, W - 4),
      new Date(lastOrder.createdAt).toLocaleString('en-GB', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).replace(',',''),
    ];

    if (lastOrder.delivery?.driverName) {
      lines.push('Driver: ' + lastOrder.delivery.driverName.substring(0, W - 8));
      if (lastOrder.delivery?.scheduledDate) {
        lines.push('Date: ' + new Date(lastOrder.delivery.scheduledDate).toLocaleDateString());
      }
    }
    if (lastOrder.notes) {
      lines.push('Notes: ' + (lastOrder.notes).substring(0, W - 5));
    }

    lines.push(D);

    let totalQty = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastOrder.items.forEach((i: any) => {
      const name = (i.product?.name || 'Item').toUpperCase();
      const uom = i.uomName ? ` (${i.uomName})` : '';
      const label = name + uom;
      for (let j = 0; j < label.length; j += W) lines.push(label.substring(j, j + W));
      const qty = Number(i.quantity); totalQty += qty;
      lines.push(lr(' ' + qty + ' x ' + Number(i.price).toFixed(2), (qty * Number(i.price)).toFixed(2)));
    });
    lines.push(lr('', '(' + totalQty + ') Items'));
    lines.push(D);

    const sub = (lastOrder.subtotal || (lastOrder.totalAmount + (lastOrder.discount || 0))).toFixed(2);
    lines.push(lr('TOTAL SALE:', sub));
    lines.push(lr('DISCOUNT:', (lastOrder.discount || 0).toFixed(2)));
    lines.push(lr('AMOUNT DUE:', lastOrder.totalAmount.toFixed(2)));
    lines.push(lr('CASH:', (lastOrder.tendered || 0).toFixed(2)));
    lines.push(lr('CHANGE:', (lastOrder.change || 0).toFixed(2)));
    lines.push(D);
    lines.push('');
    lines.push(center('** OFFICIAL RECEIPT **'));
    lines.push(center('FACEBOOK:'));
    lines.push(center(companyName.toUpperCase()));
    lines.push('');
    lines.push('');

    const PX_W = 384;
    const FONT_SIZE = 18;
    const LINE_H = 24;
    const PAD = 8;

    const canvas = document.createElement('canvas');
    canvas.width = PX_W;
    canvas.height = PAD + lines.length * LINE_H + PAD;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.font = `900 ${FONT_SIZE}px "Consolas", "Courier New", monospace`;
    ctx.imageSmoothingEnabled = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx as any).textRendering = 'geometricPrecision';

    lines.forEach((line, idx) => {
      const y = PAD + (idx + 1) * LINE_H - 4;
      ctx.fillText(line, PAD, y, PX_W - PAD * 2);
      ctx.lineWidth = 0.5;
      ctx.strokeText(line, PAD, y, PX_W - PAD * 2);
    });

    const imgData = canvas.toDataURL('image/png');

    const printWindow = window.open('', '_blank');
    if (!printWindow) { showToast('Please allow popups to print receipt.', 'error'); return; }

    const imgHeightMm = Math.ceil((canvas.height / PX_W) * 48);

    const html = `
      <html>
        <head>
          <title>Receipt</title>
          <style>
            @page { margin: 0; size: 58mm auto; }
            html { margin: 0; padding: 0; height: ${imgHeightMm}mm; overflow: hidden; }
            body { margin: 0; padding: 0; background: white; height: ${imgHeightMm}mm; overflow: hidden; page-break-after: avoid; }
            img { display: block; width: 48mm; height: auto; image-rendering: pixelated; page-break-after: avoid; }
          </style>
        </head>
        <body><img src="${imgData}" /></body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 800);
  };

  const printBondReceipt = () => {
    if (!lastOrder) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { showToast('Please allow popups to print receipt.', 'error'); return; }

    const html = `
      <html>
        <head>
          <title>Receipt - ${lastOrder.orderNumber || 'Order'}</title>
          <style>
            @page { margin: 15mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; font-size: 13px; color: #222; }
            .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #0061ff; padding-bottom: 16px; }
            .header h1 { font-size: 22px; font-weight: 800; color: #0061ff; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; }
            .header p { margin: 2px 0; color: #555; font-size: 12px; }
            .meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; padding: 12px 16px; background: #f5f7fa; border-radius: 8px; }
            .meta div { font-size: 12px; min-width: 120px; }
            .meta strong { display: block; font-size: 13px; color: #222; margin-bottom: 2px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            thead th { background: #0061ff; color: #fff; padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
            thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5) { text-align: right; }
            tbody td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
            tbody td:nth-child(3), tbody td:nth-child(4), tbody td:nth-child(5) { text-align: right; }
            .totals { margin-left: auto; width: 280px; }
            .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
            .totals .row.grand { border-top: 2px solid #0061ff; padding-top: 12px; margin-top: 8px; font-size: 18px; font-weight: 800; color: #0061ff; }
            .totals .row.discount { color: #e53e3e; }
            .totals .row.change { color: #38a169; font-weight: 700; }
            .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; color: #888; font-size: 11px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>{companyName}</h1>
            <p>Sarimanok St. Marawi City 2nd Branch</p>
            <p style="margin-top: 8px; font-weight: 600; color: #0061ff;">OFFICIAL RECEIPT</p>
          </div>

          <div class="meta">
            <div>
              <strong>Order #${lastOrder.orderNumber || ''}</strong>
              ${new Date(lastOrder.createdAt).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}
            </div>
            ${lastOrder.delivery?.driverName ? `
            <div>
              <strong>Delivery Driver</strong>
              ${lastOrder.delivery.driverName}
            </div>
            <div>
              <strong>Delivery Date</strong>
              ${lastOrder.delivery.scheduledDate ? new Date(lastOrder.delivery.scheduledDate).toLocaleDateString() : 'N/A'}
            </div>
            ` : ''}
            <div style="text-align: right; flex-grow: 1;">
              <strong>Cashier</strong>
              ${lastOrder.createdBy?.name || 'ADMIN'}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${lastOrder.items.map((i: { product?: { name: string }, uomName?: string, quantity: number, price: number, subtotal: number }, idx: number) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${i.product?.name || 'Item'}${i.uomName ? ` <small style="color:#0061ff;">(${i.uomName})</small>` : ''}</td>
                  <td>${i.quantity}</td>
                  <td>${Number(i.price).toFixed(2)}</td>
                  <td><strong>${(Number(i.quantity) * Number(i.price)).toFixed(2)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="totals">
            <div class="row">
              <span>Subtotal</span>
              <span>${(lastOrder.subtotal || (lastOrder.totalAmount + (lastOrder.discount || 0))).toFixed(2)}</span>
            </div>
            ${lastOrder.discount > 0 ? `
              <div class="row discount">
                <span>Discount</span>
                <span>-${lastOrder.discount.toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="row grand">
              <span>Total</span>
              <span>₱${lastOrder.totalAmount.toFixed(2)}</span>
            </div>
            ${lastOrder.tendered > 0 ? `
              <div class="row">
                <span>Amount Paid</span>
                <span>${lastOrder.tendered.toFixed(2)}</span>
              </div>
              <div class="row change">
                <span>Change</span>
                <span>${(lastOrder.change || 0).toFixed(2)}</span>
              </div>
            ` : ''}
          </div>

          <div class="footer">
            <p>Thank you for your purchase!</p>
            <p>Facebook: {companyName.toUpperCase()}</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  return (
    <>
      <div className="walkin-layout" style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', background: 'var(--bg-main)', margin: '-24px' }}>
        
        {/* LEFT PANEL: Order Details & Product Grid */}
        <div className="walkin-left-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          
          <div style={{ padding: '24px', paddingBottom: '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>

              <div className="mobile-text-center" style={{ width: '100%' }}>
                <h1 className="page-title" style={{ margin: 0 }}>Walk-in Home Order</h1>
                <p className="page-subtitle" style={{ margin: 0 }}>Process a new wholesale delivery or walk-in pickup.</p>
              </div>
            </div>

            {/* Order Details Surface Card */}
            <div className="card" style={{ marginBottom: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
              <div className="card-header" style={{ borderBottom: '1px solid var(--border-light)', padding: '16px 20px' }}>
                <h3 className="card-title" style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={18} color="var(--primary)" /> 
                  Order Details
                </h3>
              </div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', padding: '20px' }}>
                
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <div className="form-label">Order Type</div>
                  {/* Segmented Controls */}
                  <div style={{ display: 'flex', width: '100%', background: 'var(--bg-main)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)', gap: '4px' }}>
                    <button
                      onClick={() => { setFulfillmentMode('delivery'); setSelectedCustomerId(''); }}
                      style={{
                        flex: 1, padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s ease', border: 'none',
                        background: fulfillmentMode === 'delivery' ? '#FFFFFF' : 'transparent',
                        color: fulfillmentMode === 'delivery' ? 'var(--primary)' : 'var(--text-secondary)',
                        boxShadow: fulfillmentMode === 'delivery' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
                      }}
                    >
                      <Truck size={16} /> Delivery
                    </button>
                    <button
                      onClick={() => { setFulfillmentMode('walkin'); setSelectedCustomerId(''); }}
                      style={{
                        flex: 1, padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s ease', border: 'none',
                        background: fulfillmentMode === 'walkin' ? '#FFFFFF' : 'transparent',
                        color: fulfillmentMode === 'walkin' ? 'var(--primary)' : 'var(--text-secondary)',
                        boxShadow: fulfillmentMode === 'walkin' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
                      }}
                    >
                      <User size={16} /> Walk-in
                    </button>
                  </div>
                </div>

                {fulfillmentMode === 'delivery' && (
                  <div className="form-group">
                    <label htmlFor="create-order-customer" className="form-label">Customer</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select id="create-order-customer" name="customerId" className="form-select" style={{ flex: 1 }} value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)}>
                        <option value="">-- Select Customer --</option>
                        {customers
                          .filter(c => c.customerType === 'wholesale' || !c.customerType)
                          .filter(c => c.name !== '[Normal Walk-in]')
                          .map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="create-order-status" className="form-label">Order Status</label>
                  <select 
                    id="create-order-status"
                    name="orderStatus"
                    className="form-select" 
                    value={orderStatus} 
                    onChange={e => setOrderStatus(e.target.value)}
                  >
                    <option value="pending">Pending (Not yet ready)</option>
                    <option value="confirmed">Confirmed (Packed & Ready)</option>
                    <option value="delivered">Delivered (Completed / Picked up)</option>
                  </select>
                </div>
                
                {fulfillmentMode === 'delivery' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="create-order-driver" className="form-label">Assign Delivery Driver <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <select id="create-order-driver" name="deliveryDriverId" className="form-select" value={deliveryDriverId} onChange={e => {
                        setDeliveryDriverId(e.target.value);
                        setDeliveryDriverName(drivers.find(d => d.id === e.target.value)?.name || '');
                      }} style={{ borderColor: !deliveryDriverId ? 'var(--danger-light)' : 'var(--border)' }}>
                        <option value="">-- Select Driver --</option>
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {drivers.filter((d: any) => d.status === 'active').map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="create-order-delivery-date" className="form-label">Scheduled Delivery Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input id="create-order-delivery-date" name="deliveryDate" type="date" className="form-input" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} disabled={lockOrderDate && !isAdmin} style={{ borderColor: !deliveryDate ? 'var(--danger-light)' : 'var(--border)' }} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Product Selection Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 24px' }}>
            {/* Search & Categories */}
            <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ 
                flex: 1, 
                display: 'flex', 
                alignItems: 'center', 
                background: 'var(--bg-card)', 
                border: '1px solid var(--border)', 
                borderRadius: 'var(--radius-lg)', 
                padding: '10px 16px', 
                transition: 'all 0.2s ease',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' 
              }}>
                <Search size={20} color="var(--text-tertiary)" style={{ marginRight: '12px' }} />
                <input 
                  id="create-order-product-search"
                  name="productSearch"
                  aria-label="Search products by name, SKU, or scan barcode"
                  type="text" 
                  style={{ 
                    flex: 1, 
                    border: 'none', 
                    background: 'transparent', 
                    fontSize: '15px', 
                    color: 'var(--text-primary)', 
                    outline: 'none',
                    width: '100%'
                  }} 
                  placeholder="Search products by name, SKU, or scan barcode..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                
                {/* Integrated Toolbar Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '12px', borderLeft: '1px solid var(--border)', paddingLeft: '12px' }}>
                  {isHardwareScannerReady ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: 600, fontSize: '13px' }} data-tooltip="USB Scanner Ready">
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 6px var(--primary)' }}></div>
                      <ScanLine size={20} color="var(--primary)" />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)' }} data-tooltip="USB Scanner Not Detected">
                      <ScanLine size={20} />
                    </div>
                  )}

                  <button 
                    onClick={startScanner} 
                    data-tooltip="Use Device Camera"
                    style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isScanning ? 'var(--danger-light)' : 'transparent',
                      color: isScanning ? 'var(--danger)' : 'var(--text-secondary)',
                      border: 'none', borderRadius: 'var(--radius-md)', padding: '6px', cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Camera size={20} />
                  </button>
                </div>
              </div>

              {isScanning && (
                <div style={{ position: 'relative', padding: '16px', background: '#000', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
                  <div id="pos-reader" style={{ width: '100%', maxWidth: '400px', margin: '0 auto', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}></div>
                  
                  {isPaused && (
                    <div 
                      style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', gap: '12px', color: '#fff', zIndex: 10
                      }}
                    >
                      <CheckCircle2 size={48} color="var(--success)" />
                      <span style={{ fontSize: '18px', fontWeight: 600 }}>Scanned Successfully</span>
                    </div>
                  )}

                  <button 
                    onClick={stopScanner}
                    style={{
                      position: 'absolute', top: '16px', right: '16px', zIndex: 20,
                      background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', padding: '8px', cursor: 'pointer', color: '#fff', transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
                  >
                    <X size={20} />
                  </button>
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                {categories.map(cat => (
                  <button 
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    style={{
                      padding: '8px 16px', borderRadius: '100px', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
                      border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                      background: categoryFilter === cat ? 'var(--primary)' : 'var(--bg-card)',
                      color: categoryFilter === cat ? 'white' : 'var(--text-secondary)',
                      boxShadow: categoryFilter === cat ? '0 4px 10px rgba(0, 97, 255, 0.3)' : 'var(--shadow-sm)'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Grid */}
            <div className="walkin-product-grid" style={{ paddingBottom: '24px', display: 'grid', gap: '16px', alignContent: 'start' }}>
              {filteredProducts.map(product => (
                <div 
                  key={product.id}
                  className="walkin-product-card"
                  onClick={() => {
                    if (product.stock > 0) {
                      if (product.uoms && product.uoms.length > 0) {
                        setSelectedProductForUom(product);
                      } else {
                        addToCart(product);
                      }
                    }
                  }}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                    padding: '16px', cursor: product.stock > 0 ? 'pointer' : 'not-allowed', transition: 'transform 0.1s, box-shadow 0.2s',
                    display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative',
                    opacity: product.stock <= 0 ? 0.6 : 1
                  }}
                  onMouseEnter={e => { if(product.stock > 0) e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  {product.stock <= 5 && product.stock > 0 && (
                    <span style={{ position: 'absolute', top: '10px', right: '10px', background: 'var(--warning)', color: '#fff', fontSize: '10px', padding: '3px 8px', borderRadius: '100px', fontWeight: 'bold' }}>Low</span>
                  )}
                  {product.stock <= 0 && (
                    <span style={{ position: 'absolute', top: '10px', right: '10px', background: 'var(--danger)', color: '#fff', fontSize: '10px', padding: '3px 8px', borderRadius: '100px', fontWeight: 'bold' }}>Out</span>
                  )}
                  
                  <div className="walkin-product-img" style={{ width: '100%', aspectRatio: '1', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', overflow: 'hidden' }}>
                    {product.image ? (
                      <Image width={400} height={400} src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                    ) : (
                      <ShoppingBag size={32} opacity={0.5} />
                    )}
                  </div>
                  <div>
                    <div className="walkin-product-title" style={{ fontWeight: 600, fontSize: '14px', lineHeight: 1.3, color: 'var(--text-primary)', marginBottom: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {product.name}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="walkin-product-price" style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '15px' }}>{formatCurrency(product.price)}</span>
                          <span className="walkin-product-badge" style={{ fontSize: '9px', background: 'var(--bg-hover)', color: 'var(--text-secondary)', padding: '2px 4px', borderRadius: '4px', fontWeight: 600 }}>(Base)</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                          Stock: {product.stock}
                        </div>
                      </div>
                      {product.uoms && product.uoms.filter(u => !u.isBase).map(uom => (
                        <div key={uom.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '13px' }}>{formatCurrency(uom.price)}</span>
                          <span style={{ fontSize: '9px', background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 4px', borderRadius: '4px', fontWeight: 600 }}>{uom.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Cart Overlay */}
        {isMobileCartOpen && (
          <div className="mobile-cart-overlay" onClick={() => setIsMobileCartOpen(false)}></div>
        )}

        {/* Mobile Floating Cart Button */}
        <div className="mobile-fab-container">
          <button className="mobile-fab" onClick={() => setIsMobileCartOpen(true)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative' }}>
                <ShoppingCart size={24} />
                {cart.length > 0 && (
                  <span style={{ position: 'absolute', top: '-8px', right: '-8px', background: 'var(--danger)', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '100px', border: '2px solid var(--primary)' }}>
                    {cart.length}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '16px', fontWeight: 700 }}>View Cart</span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800 }}>
              {formatCurrency(finalTotal)}
            </div>
          </button>
        </div>

        {/* RIGHT PANEL: Cart & Payment */}
        <div className={`walkin-right-panel ${isMobileCartOpen ? 'mobile-open' : ''}`} style={{ width: '420px', display: 'flex', flexDirection: 'column', background: '#FFFFFF', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 25px rgba(0,0,0,0.03)', zIndex: 10, borderRadius: '16px 16px 0 0' }}>
          <div className="mobile-drag-handle" style={{ width: '40px', height: '4px', background: 'var(--border)', borderRadius: '2px', margin: '12px auto 0 auto' }}></div>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingCart size={20} color="var(--primary)" />
              Order Cart
            </h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {cart.length > 0 && (
                <>
                  <button onClick={() => setIsViewItemsOpen(true)} className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '12px', height: 'auto', borderRadius: '100px' }}>
                    View All ({cart.length})
                  </button>
                  <button onClick={() => setShowClearConfirm(true)} className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '12px', height: 'auto', borderRadius: '100px', color: 'var(--danger)', borderColor: 'var(--danger-light)' }}>
                    Clear
                  </button>
                </>
              )}
              {/* Close Button only visible on Mobile */}
              <button onClick={() => setIsMobileCartOpen(false)} className="btn btn-icon btn-ghost mobile-only-close" style={{ color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Cart Items Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: 'var(--bg-main)' }}>
            {cart.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)', gap: '16px' }}>
                <div style={{ width: '64px', height: '64px', flexShrink: 0, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
                  <ShoppingCart size={28} opacity={0.3} />
                </div>
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 500 }}>Select products to add them to the cart</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {cart.map((item) => (
                  <div key={`${item.product.id}-${item.uomName}`} style={{ background: '#FFFFFF', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', gap: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {item.product.image ? (
                        <Image width={400} height={400} src={item.product.image} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                      ) : (
                        <ShoppingBag size={24} color="var(--text-tertiary)" />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', lineHeight: 1.3, paddingRight: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.product.name}
                        </div>
                        <button onClick={() => removeFromCart(item.product.id, item.uomName)} className="btn btn-icon btn-ghost" style={{ padding: 0, width: '24px', height: '24px', color: 'var(--danger)', opacity: 0.7 }}><X size={16} /></button>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{item.product.sku}</div>
                        {item.uomName ? (
                          <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                            {item.uomName} ×{item.multiplier}
                          </span>
                        ) : (
                          <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                            Base
                          </span>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-main)', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                          <button onClick={() => updateQty(item.product.id, item.uomName, Number(item.qty) - 1, true)} className="btn btn-icon btn-ghost" style={{ width: '28px', height: '28px', padding: 0 }}><Minus size={14} /></button>
                          <input 
                            id={`create-order-qty-${item.product.id}`}
                            name={`cartQty_${item.product.id}`}
                            aria-label="Quantity"
                            type="number" 
                            min="1" 
                            value={item.qty || ''} 
                            onChange={e => updateQty(item.product.id, item.uomName, e.target.value === '' ? '' : parseInt(e.target.value))}
                            style={{ width: '40px', textAlign: 'center', border: 'none', background: 'transparent', padding: '4px', fontSize: '13px', fontWeight: 600 }}
                          />
                          <button onClick={() => updateQty(item.product.id, item.uomName, Number(item.qty) + 1, true)} className="btn btn-icon btn-ghost" style={{ width: '28px', height: '28px', padding: 0 }}><Plus size={14} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
                            {formatCurrency((item.qty || 0) * (item.cartPrice || 0))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment & Checkout Area */}
          <div style={{ padding: '24px', background: '#FFFFFF', borderTop: '1px solid var(--border)', boxShadow: '0 -4px 20px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="create-order-payment-status" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Payment Status</label>
                  <select id="create-order-payment-status" name="paymentStatus" className="form-select" value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} style={{ fontSize: '13px', height: '40px', background: 'var(--bg-main)' }}>
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Fully Paid</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="create-order-discount" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Discount
                    <div style={{ display: 'flex', background: 'var(--bg-main)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <button onClick={() => setDiscountType('percent')} style={{ padding: '2px 8px', border: 'none', background: discountType === 'percent' ? 'var(--primary)' : 'transparent', color: discountType === 'percent' ? 'white' : 'var(--text-tertiary)', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}>%</button>
                      <button onClick={() => setDiscountType('flat')} style={{ padding: '2px 8px', border: 'none', background: discountType === 'flat' ? 'var(--primary)' : 'transparent', color: discountType === 'flat' ? 'white' : 'var(--text-tertiary)', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}>₱</button>
                    </div>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                      {discountType === 'percent' ? '%' : '₱'}
                    </span>
                    <input id="create-order-discount" name="discountValue" aria-label="Discount amount" type="number" step="0.01" min="0" max={discountType === 'percent' ? "100" : undefined} className="form-input" placeholder="0" value={discountValue} onChange={e => setDiscountValue(e.target.value)} style={{ fontSize: '13px', height: '40px', paddingLeft: '30px', background: 'var(--bg-main)' }} />
                  </div>
                </div>
              </div>

              {['partial', 'paid'].includes(paymentStatus) && (
                <div style={{ animation: 'toastSlideUp 0.2s ease-out' }}>
                  <label htmlFor="create-order-amount-paid" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Amount Tendered <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '14px', fontWeight: 700 }}>₱</span>
                    <input id="create-order-amount-paid" name="amountPaid" type="number" step="0.01" className="form-input" placeholder="0.00" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} style={{ fontSize: '16px', height: '48px', paddingLeft: '30px', fontWeight: 700, color: 'var(--success-dark)', borderColor: (['paid', 'partial'].includes(paymentStatus) && (parseFloat(amountPaid)||0) < finalTotal && paymentStatus === 'paid') ? 'var(--danger)' : 'var(--border)' }} />
                  </div>
                </div>
              )}
              
            </div>

            <div style={{ borderTop: '2px dashed var(--border)', paddingTop: '16px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <span>Total Products</span>
                <span style={{ fontWeight: 600 }}>
                  {(() => {
                    const bulkCount = cart.filter(item => item.uomName).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
                    const baseCount = cart.filter(item => !item.uomName).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
                    
                    return (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {bulkCount > 0 && <span style={{ color: 'var(--primary-dark)', background: 'var(--primary-light)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{bulkCount} Bulk</span>}
                        {baseCount > 0 && <span style={{ color: 'var(--text-secondary)', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{baseCount} Base</span>}
                        {bulkCount === 0 && baseCount === 0 && <span>0</span>}
                      </div>
                    );
                  })()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <span>Subtotal</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(totalAmount)}</span>
              </div>
              {discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--danger)', marginBottom: '8px', fontWeight: 600 }}>
                  <span>Discount</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              {['partial', 'paid'].includes(paymentStatus) && parseFloat(amountPaid) > finalTotal && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--success-dark)', marginBottom: '8px', fontWeight: 700 }}>
                  <span>Change</span>
                  <span>{formatCurrency(change)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Due</span>
                <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.5px' }}>{formatCurrency(finalTotal)}</span>
              </div>
            </div>

            <button 
              className="btn btn-primary" 
              style={{ width: '100%', height: '56px', fontSize: '16px', fontWeight: 700, borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', boxShadow: '0 8px 24px rgba(37, 99, 235, 0.25)', transition: 'all 0.2s ease' }}
              onClick={() => setShowConfirmCheckout(true)}
              disabled={isSubmitting || cart.length === 0}
              onMouseEnter={e => { if(!e.currentTarget.disabled) e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
            >
              <Save size={20} />
              {isSubmitting ? 'Processing...' : `Charge ${formatCurrency(finalTotal)}`}
            </button>
          </div>
        </div>
      </div>

      {/* UOM Selection Modal - Enterprise Dual Card Design */}
      {selectedProductForUom && (
        <div className="modal-overlay" style={{  }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: '500px', padding: '32px', borderRadius: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.5px' }}>Select Unit Variant</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '4px 0 0 0' }}>Choose which unit of <strong>{selectedProductForUom.name}</strong> to add.</p>
              </div>
              <button className="btn btn-icon btn-ghost" onClick={() => setSelectedProductForUom(null)} style={{ background: 'var(--bg-main)' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <button 
                onClick={() => { addToCart(selectedProductForUom); setSelectedProductForUom(null); }}
                style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', 
                  background: '#FFFFFF', border: '2px solid var(--border-light)', borderRadius: '16px', 
                  cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'left'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedProductForUom.uoms?.find(u => u.isBase)?.name || 'Base Unit'}</span>
                    <span style={{ fontSize: '10px', background: 'var(--bg-hover)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '100px', fontWeight: 700, textTransform: 'uppercase' }}>Standard</span>
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>1 {selectedProductForUom.unit || 'pcs'}</div>
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>{formatCurrency(selectedProductForUom.price)}</div>
              </button>
              
              {selectedProductForUom.uoms?.filter(u => !u.isBase).map(uom => (
                <button 
                  key={uom.id}
                  onClick={() => { addToCart(selectedProductForUom, undefined, uom.name); setSelectedProductForUom(null); }}
                  style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', 
                    background: '#FFFFFF', border: '2px solid var(--border-light)', borderRadius: '16px', 
                    cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'left'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{uom.name}</span>
                      <span style={{ fontSize: '10px', background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '100px', fontWeight: 700, textTransform: 'uppercase' }}>Bulk</span>
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Contains {uom.multiplier} {selectedProductForUom.unit || 'pcs'}</div>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>{formatCurrency(uom.price)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View All Items Modal */}
      {isViewItemsOpen && (
        <div className="modal-overlay" style={{  }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '800px', borderRadius: '24px', overflow: 'hidden' }}>
            <div className="modal-header" style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)' }}>
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '20px' }}>
                <ShoppingCart size={24} color="var(--primary)" /> Complete Order List
              </h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setIsViewItemsOpen(false)} style={{ background: 'var(--bg-main)' }}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: 0, background: 'var(--bg-main)' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <tr>
                    <th style={{ padding: '16px 24px' }}>Product Details</th>
                    <th style={{ padding: '16px 24px', textAlign: 'center' }}>Quantity</th>
                    <th style={{ padding: '16px 24px', textAlign: 'right' }}>Unit Price</th>
                    <th style={{ padding: '16px 24px', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '16px 24px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={`${item.product.id}-${item.uomName || 'base'}`} style={{ borderBottom: '1px solid var(--border)', background: '#FFFFFF' }}>
                      <td data-label="Product" style={{ padding: '16px 24px' }}>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                          {item.product.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{item.product.sku}</span>
                          {item.uomName ? (
                            <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}>
                              {item.uomName} (A-{item.multiplier})
                            </span>
                          ) : (
                            <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}>
                              Base Unit
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Quantity" style={{ padding: '16px 24px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--bg-main)', padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <button onClick={() => updateQty(item.product.id, item.uomName, Number(item.qty) - 1, true)} className="btn btn-icon btn-ghost" style={{ width: '28px', height: '28px', padding: 0 }}><Minus size={14} /></button>
                          <input 
                            id={`create-order-modal-qty-${item.product.id}-${item.uomName}`}
                            name={`modalQty_${item.product.id}_${item.uomName}`}
                            aria-label="Quantity"
                            type="number" 
                            value={item.qty}
                            onChange={(e) => updateQty(item.product.id, item.uomName, e.target.value === '' ? '' : parseInt(e.target.value))}
                            style={{ width: '40px', textAlign: 'center', fontWeight: 700, fontSize: '15px', border: 'none', background: 'transparent', color: 'var(--text-primary)' }}
                          />
                          <button onClick={() => updateQty(item.product.id, item.uomName, Number(item.qty) + 1, true)} className="btn btn-icon btn-ghost" style={{ width: '28px', height: '28px', padding: 0 }}><Plus size={14} /></button>
                        </div>
                      </td>
                      <td data-label="Unit Price" style={{ padding: '16px 24px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>₱</span>
                          <input 
                            id={`create-order-modal-price-${item.product.id}-${item.uomName}`}
                            name={`modalPrice_${item.product.id}_${item.uomName}`}
                            aria-label="Unit Price"
                            type="number" 
                            value={item.cartPrice} 
                            onChange={e => updatePrice(item.product.id, item.uomName, parseFloat(e.target.value) || 0)}
                            style={{ width: '70px', textAlign: 'right', border: '1px dashed var(--border)', background: 'var(--bg-main)', padding: '4px 8px', fontSize: '14px', fontWeight: 700, color: 'var(--primary)', borderRadius: '6px' }}
                          />
                        </div>
                      </td>
                      <td data-label="Total" style={{ padding: '16px 24px', textAlign: 'right', fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{formatCurrency(item.cartPrice * (Number(item.qty) || 0))}</td>
                      <td data-label="Actions" style={{ padding: '16px 24px', textAlign: 'center' }}>
                        <button onClick={() => removeFromCart(item.product.id, item.uomName)} className="btn btn-icon btn-ghost" style={{ color: 'var(--danger)', background: 'var(--danger-light)' }}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer" style={{ padding: '24px 32px', background: '#FFFFFF', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Products:</span>
                {(() => {
                  const bulkCount = cart.filter(item => item.uomName).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
                  const baseCount = cart.filter(item => !item.uomName).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
                  
                  return (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {bulkCount > 0 && <span style={{ color: 'var(--primary-dark)', background: 'var(--primary-light)', padding: '4px 12px', borderRadius: '100px', fontSize: '14px', fontWeight: 700 }}>{bulkCount} Bulk</span>}
                      {baseCount > 0 && <span style={{ color: 'var(--text-secondary)', background: 'var(--bg-hover)', padding: '4px 12px', borderRadius: '100px', fontSize: '14px', fontWeight: 700 }}>{baseCount} Base</span>}
                      {bulkCount === 0 && baseCount === 0 && <span style={{ color: 'var(--text-tertiary)', background: 'var(--bg-hover)', padding: '4px 12px', borderRadius: '100px', fontSize: '14px', fontWeight: 700 }}>0 Items</span>}
                    </div>
                  );
                })()}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800 }}>
                Grand Total: <span style={{ color: 'var(--primary)' }}>{formatCurrency(finalTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Confirmation Modal */}
      {showConfirmCheckout && (
        <div className="modal-overlay" style={{ zIndex: 1000,  }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '440px', borderRadius: '24px', textAlign: 'center', padding: '32px' }}>
            <div style={{ width: '64px', height: '64px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <ShoppingCart size={32} />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '12px', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>Confirm Order</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '15px' }}>
              You are about to charge <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(finalTotal)}</strong>.
              <br/><br/>
              {paymentStatus === 'unpaid' && <span style={{ color: 'var(--danger)', fontWeight: 600, display: 'block', marginBottom: '8px' }}><AlertTriangle size={16} style={{ display: 'inline', marginBottom: '-3px', marginRight: '4px' }} /> This order is marked as UNPAID.</span>}
              {paymentStatus === 'partial' && <span style={{ color: 'var(--warning)', fontWeight: 600, display: 'block', marginBottom: '8px' }}><AlertTriangle size={16} style={{ display: 'inline', marginBottom: '-3px', marginRight: '4px' }} /> This order is marked as PARTIALLY PAID.</span>}
              {paymentStatus === 'paid' && <span style={{ color: 'var(--success)', fontWeight: 600, display: 'block', marginBottom: '8px' }}><CheckCircle2 size={16} style={{ display: 'inline', marginBottom: '-3px', marginRight: '4px' }} /> This order is marked as FULLY PAID.</span>}
              Please confirm the details are correct.
            </p>
            <div style={{ display: 'flex', gap: '16px' }}>
              <button className="btn btn-secondary" style={{ flex: 1, height: '48px', borderRadius: '12px', fontSize: '15px' }} onClick={() => setShowConfirmCheckout(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, height: '48px', borderRadius: '12px', fontSize: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }} onClick={() => { setShowConfirmCheckout(false); handleSubmit(); }}>
                <CheckCircle2 size={18} /> Yes, Charge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Cart Confirmation Modal */}
      {showClearConfirm && (
        <div className="modal-overlay" style={{ zIndex: 1000,  }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '400px', borderRadius: '24px', textAlign: 'center', padding: '32px' }}>
            <div style={{ width: '64px', height: '64px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Trash2 size={32} />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '12px', color: 'var(--text-primary)' }}>Clear Cart?</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '15px' }}>Are you absolutely sure you want to remove all items? This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '16px' }}>
              <button className="btn btn-secondary" style={{ flex: 1, height: '48px', borderRadius: '12px', fontSize: '15px' }} onClick={() => setShowClearConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, height: '48px', borderRadius: '12px', fontSize: '15px', background: 'var(--danger)', borderColor: 'var(--danger)', boxShadow: '0 8px 20px rgba(239, 68, 68, 0.3)' }} onClick={clearCart}>Clear All</button>
            </div>
          </div>
        </div>
      )}


      {/* Success Modal - Enterprise Layout */}
      {isSuccessOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000, padding: '16px' }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', borderRadius: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div style={{ padding: '24px 32px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: '64px', height: '64px', background: 'var(--success-light)', color: 'var(--success)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 4px 20px rgba(16, 185, 129, 0.15)' }}>
                <CheckCircle2 size={32} />
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>Order Completed!</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: 0 }}>Order <strong style={{ color: 'var(--text-primary)' }}>#{lastOrder?.orderNumber}</strong> has been successfully processed.</p>
            </div>
            
            <div style={{ padding: '24px', background: 'var(--bg-main)', flexShrink: 0 }}>
              <div className="form-grid-2" style={{ marginBottom: '16px' }}>
                <button 
                  onClick={printBondReceipt} 
                  style={{ 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', 
                    padding: '20px 16px', background: '#FFFFFF', border: '1px solid var(--border)', borderRadius: '16px', 
                    cursor: 'pointer', transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.08)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Printer size={20} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Print Bond Paper</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>A4 / Letter receipt</div>
                </button>

                <button 
                  onClick={printThermalReceipt} 
                  style={{ 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', 
                    padding: '20px 16px', background: '#FFFFFF', border: '1px solid var(--border)', borderRadius: '16px', 
                    cursor: 'pointer', transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.08)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                    <Receipt size={20} />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Print Thermal</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>58mm POS receipt</div>
                </button>
              </div>
              
              <button 
                className="btn btn-primary" 
                onClick={() => setIsSuccessOpen(false)} 
                style={{ width: '100%', height: '56px', fontSize: '16px', fontWeight: 700, borderRadius: '12px', marginTop: '8px' }}
              >
                Start New Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div 
          style={{ 
            position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
            background: toastMessage.type === 'error' ? 'var(--danger)' : toastMessage.type === 'warning' ? '#f59e0b' : 'var(--success)',
            color: 'white', padding: '16px 24px', borderRadius: '100px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600, fontSize: '15px',
            animation: 'toastSlideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}
        >
          {toastMessage.type === 'success' && <CheckCircle2 size={20} />}
          {toastMessage.type === 'error' && <AlertCircle size={20} />}
          {toastMessage.type === 'warning' && <AlertCircle size={20} />}
          {toastMessage.message}
        </div>
      )}

      <style jsx global>{`
        @keyframes toastSlideUp {
          from { transform: translate(-50%, 40px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
        .walkin-product-grid {
          grid-template-columns: repeat(3, 1fr);
        }
        .mobile-cart-overlay { display: none; }
        .mobile-fab-container { display: none; }
        .mobile-only-close { display: none !important; }
        .mobile-drag-handle { display: none; }

        @media (max-width: 1100px) {
          .mobile-drag-handle {
            display: block; width: 40px; height: 4px; background: var(--border); border-radius: 4px;
            margin: 12px auto 20px;
          }
          .mobile-cart-overlay {
            display: block; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px); z-index: 900;
          }
          .mobile-fab {
            width: 100%; background: var(--primary); color: #fff; border: none; border-radius: 100px;
            padding: 16px 24px; display: flex; justify-content: space-between; align-items: center;
            box-shadow: 0 12px 32px rgba(37, 99, 235, 0.3); cursor: pointer; transition: transform 0.2s;
          }
          .mobile-fab:active { transform: scale(0.98); }
          .mobile-only-close { display: flex !important; }

          .walkin-layout {
            flex-direction: column !important;
            height: calc(100vh - 64px) !important;
            overflow: hidden !important;
            margin: calc(var(--space-sm) * -1) calc(var(--space-md) * -1) !important;
          }
          .walkin-left-panel {
            overflow-y: auto !important;
            padding-bottom: 100px !important;
          }
          .walkin-right-panel {
            position: fixed !important; top: auto !important; bottom: 0 !important; left: 0 !important; right: 0 !important;
            width: 100% !important; height: 85vh !important; border-radius: 16px 16px 0 0 !important;
            transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1);
            z-index: 1000 !important; box-shadow: 0 -10px 40px rgba(0,0,0,0.15) !important;
            border-left: none !important; border-top: 1px solid var(--border) !important;
          }
          .walkin-right-panel.mobile-open {
            transform: translateY(0);
          }
          .walkin-product-grid {
            gap: 12px !important;
            grid-template-columns: repeat(3, 1fr);
          }
          .walkin-product-card {
            padding: 10px !important;
            gap: 8px !important;
          }
          .walkin-product-title { font-size: 13px !important; margin-bottom: 4px !important; }
          .walkin-product-price { font-size: 14px !important; }
          .walkin-product-badge { font-size: 8px !important; padding: 1px 3px !important; }
        }

        @media (min-width: 769px) and (max-width: 1100px) {
          .mobile-fab-container {
            display: block; position: fixed; bottom: max(32px, env(safe-area-inset-bottom, 32px)); 
            left: calc(var(--sidebar-width) + 24px); right: 24px; z-index: 90; transition: left 0.3s ease;
          }
          :global(.app-layout.sidebar-collapsed) .mobile-fab-container {
            left: calc(var(--sidebar-collapsed) + 24px) !important;
          }
        }

        @media (max-width: 768px) {
          .mobile-fab-container {
            display: block; position: fixed; bottom: max(32px, env(safe-area-inset-bottom, 32px)); 
            left: 24px; right: 24px; z-index: 90;
          }
        }

        @media (max-width: 600px) {
          .walkin-product-grid { grid-template-columns: repeat(2, 1fr); gap: 8px !important; }
          .walkin-product-card { padding: 8px !important; border-radius: var(--radius-md) !important; }
          .walkin-product-title { font-size: 12px !important; }
          .walkin-product-price { font-size: 13px !important; }
        }
      `}</style>
    </>
  );
}

