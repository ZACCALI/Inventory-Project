'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ScanBarcode, Camera, CheckCircle2, AlertCircle, Plus, Minus, X, ClipboardList, Save, Search, Loader2, Image as ImageIcon, Trash2, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { Html5Qrcode } from 'html5-qrcode';
import { useAlert } from '@/components/AlertModal';
import { useBarcodeScanner } from '@/lib/useBarcodeScanner';
import { addSyncTask } from '@/lib/offlineSync';
import { db, type OfflineProduct } from '@/lib/db';

import Image from "next/image";
const pluralize = (str: string, qty: number) => {
  if (qty <= 1 || !str) return str || '';
  if (str.toLowerCase() === 'pcs') return str;
  if (str.toLowerCase() === 'piece' && qty > 1) return 'Pieces';
  if (str.toLowerCase().endsWith('s')) return str;
  return str + 's';
};

interface ScannedProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  status: string;
  image?: string;
  unit?: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  uoms?: any[];
  scannedUom?: { id?: string; name: string; multiplier: number } | null;
  physicalCounts?: {
    base: number;
    uoms: { [key: string]: number };
  };
}

export default function BarcodeScannerPage() {
  const { showAlert, showConfirm, showToast } = useAlert();
  const { data: session } = useSession();
  const router = useRouter();
  const [scannedCode, setScannedCode] = useState('');
  const [lastScanned, setLastScanned] = useState<ScannedProduct | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Audit Mode State
  const [auditMode, setAuditMode] = useState(false);
  const auditModeRef = useRef(false);
  
  const setAuditState = (mode: boolean) => {
    setAuditMode(mode);
    auditModeRef.current = mode;

    // UX Enhancement: Auto-add the currently viewed item to the audit list
    if (mode && lastScanned) {
      setAuditItems(prev => {
        // Prevent duplicates
        if (prev.some(item => item.id === lastScanned.id)) return prev;
        
        // Add it to the list with 0 physical counts ready to be audited
        const newItem = {
          ...lastScanned,
          scannedQty: 0,
          physicalCounts: {
            base: 0,
 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
            uoms: lastScanned.uoms?.reduce((acc: any, uom: any) => ({ ...acc, [uom.id || uom.name]: 0 }), {}) || {}
          }
        };
        return [newItem, ...prev];
      });
    }
  };

  const [auditItems, setAuditItems] = useState<(ScannedProduct & { scannedQty: number })[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [notFoundCode, setNotFoundCode] = useState('');

  // Load from Local Storage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('amroding_audit_items');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAuditItems(parsed);
          setAuditState(true);
        }
      }
    } catch (e) {
      console.error('Failed to load audit items', e);
    } finally {
      setIsInitialized(true);
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save to Local Storage when auditItems change
  useEffect(() => {
    if (isInitialized) {
      if (auditItems.length > 0) {
        localStorage.setItem('amroding_audit_items', JSON.stringify(auditItems));
      } else {
        localStorage.removeItem('amroding_audit_items');
      }
    }
  }, [auditItems, isInitialized]);

  // Batch Selection Modal State for Surplus
  const [batchSelectionState, setBatchSelectionState] = useState<{
    isOpen: boolean;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[];
    currentIndex: number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    selections: Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    availableBatches: any[];
    loadingBatches: boolean;
    newBatchMode: boolean;
    newBatchDate: string;
    newBatchNum: string;
  } | null>(null);

  // Camera Pause State
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);

  const setPausedState = (paused: boolean) => {
    setIsPaused(paused);
    isPausedRef.current = paused;
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedCodeRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);

  // Fallback Search State
  const [fallbackQuery, setFallbackQuery] = useState('');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [fallbackResults, setFallbackResults] = useState<any[]>([]);
  const [isSearchingFallback, setIsSearchingFallback] = useState(false);
  const [showFallbackDropdown, setShowFallbackDropdown] = useState(false);
  const fallbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fallbackRef.current && !fallbackRef.current.contains(event.target as Node)) {
        setShowFallbackDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (fallbackQuery.trim().length < 2) {
      setFallbackResults([]);
      setShowFallbackDropdown(false);
      return;
    }
    
    // Instant local Dexie search response
    const searchLocal = async () => {
      try {
        const allProducts = await db.products.toArray();
        const q = fallbackQuery.toLowerCase();
        const results = allProducts
          .filter((p: OfflineProduct) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
          .slice(0, 5);
        if (results.length > 0) {
          setFallbackResults(results);
          setShowFallbackDropdown(true);
        }
      } catch (err) {}
    };
    
    // Fire instant local search
    searchLocal();

    const timer = setTimeout(async () => {
      setIsSearchingFallback(true);
      try {
        // Offline: stop here, local search already ran
        const isOffline = !isOnline;
        if (isOffline) {
          setIsSearchingFallback(false);
          return;
        }
        const res = await fetch(`/api/products?search=${encodeURIComponent(fallbackQuery)}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setFallbackResults(data);
          setShowFallbackDropdown(true);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearchingFallback(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [fallbackQuery, isOnline]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFallbackSelect = (product: any) => {
    setFallbackQuery('');
    setFallbackResults([]);
    setShowFallbackDropdown(false);
    handleLookup(product.sku, false);
  };

  const clearResults = () => {
    setLastScanned(null);
    setAuditItems([]);
    setNotFoundCode('');
  };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calculateTotalQty = (product: any, physical: NonNullable<ScannedProduct['physicalCounts']>) => {
    let total = physical.base;
    if (product.uoms) {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      product.uoms.forEach((uom: any) => {
        const uomKey = uom.id || uom.name;
        total += (physical.uoms[uomKey] || 0) * uom.multiplier;
      });
    }
    return total;
  };

  const updatePhysicalQty = (id: string, type: 'base' | 'uom', key: string, newQty: number) => {
    if (newQty < 0 || isNaN(newQty)) newQty = 0;
    setAuditItems(prev => prev.map(p => {
      if (p.id === id && p.physicalCounts) {
        const newPhysical = { ...p.physicalCounts, uoms: { ...p.physicalCounts.uoms } };
        if (type === 'base') newPhysical.base = newQty;
        else newPhysical.uoms[key] = newQty;
        return { ...p, physicalCounts: newPhysical, scannedQty: calculateTotalQty(p, newPhysical) };
      }
      return p;
    }));
  };

  const fetchBatchesForProduct = async (productId: string) => {
    try {
      const res = await fetch(`/api/batches?productId=${productId}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  };

  const saveAudit = async () => {
    if (auditItems.length === 0) return;
    
    const surplusItems = auditItems.filter(i => (i.scannedQty - i.stock) > 0);
    
    if (surplusItems.length > 0) {
      setBatchSelectionState({
        isOpen: true,
        items: surplusItems,
        currentIndex: 0,
        selections: {},
        availableBatches: [],
        loadingBatches: true,
        newBatchMode: false,
        newBatchDate: '',
        newBatchNum: ''
      });
      // Fetch batches for the first item immediately
      const batches = await fetchBatchesForProduct(surplusItems[0].id);
      setBatchSelectionState(prev => prev ? { ...prev, availableBatches: batches, loadingBatches: false } : null);
      return;
    }
    
    if (!await showConfirm('Save Audit', 'Save these audit results and automatically adjust stock for variances?')) return;
    
    await submitAudit(auditItems, {});
  };

 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const submitAudit = async (items: any[], batchSelections: Record<string, any>) => {
    setActionLoading(true);
    let errorCount = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const failedItems: any[] = [];
    
    for (const item of items) {
      const variance = item.scannedQty - item.stock;
      if (variance === 0) continue; 
      
      const type = variance > 0 ? 'IN' : 'OUT';
      
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        productId: item.id,
        type,
        quantity: Math.abs(variance),
        reason: 'Physical Audit Adjustment',
        source: 'AUDIT',
        userId: session?.user?.id
      };

      if (variance > 0 && batchSelections[item.id]) {
        const sel = batchSelections[item.id];
        if (sel.isNew) {
           payload.targetBatchId = 'NEW';
           payload.batchNumber = sel.batchNumber;
           payload.expiryDate = sel.expiryDate;
        } else {
           payload.targetBatchId = sel.batchId;
        }
      }

      try {
        const res = await fetch('/api/stock/movement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          throw new Error('Failed');
        }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {
        errorCount++;
        failedItems.push(item);
        // Queue offline for automatic sync when reconnected
        try {
          await addSyncTask('stock', 'CREATE', payload);
        } catch (syncErr) {
          console.warn('Failed to queue audit item for offline sync', syncErr);
        }
      }
    }
    
    setActionLoading(false);
    if (errorCount > 0) {
      // If there was an error, we should keep the failed items AND the 0-variance items so the user doesn't lose their checklist
      const itemsToKeep = items.filter(item => {
        const variance = item.scannedQty - item.stock;
        return variance === 0 || failedItems.some(f => f.id === item.id);
      });
      
      if (errorCount === items.filter(i => (i.scannedQty - i.stock) !== 0).length) {
        showAlert('error', 'Network Error', `Could not save audit online. ${errorCount} items have been queued offline and will sync automatically when you reconnect.`);
      } else {
        showAlert('error', 'Partial Save', `Some stock discrepancies were adjusted, but ${errorCount} items failed online and were queued offline for automatic sync.`);
      }
      setAuditItems(itemsToKeep);
    } else {
      // Check if there were any variances at all
      const hasVariances = items.some(i => i.scannedQty - i.stock !== 0);
      if (hasVariances) {
        showToast('success', 'Stock discrepancies have been automatically adjusted.');
      } else {
        showToast('success', 'All checked stock quantities were complete with no missing items!');
      }
      clearResults();
      setAuditState(false);
    }
  };

  async function startCamera() {
    try {
      setCameraActive(true);
      
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        throw new Error("No cameras found on this device.");
      }

      setTimeout(async () => {
        try {
          const scanner = new Html5Qrcode("reader");
          scannerRef.current = scanner;
          
          try {
            await scanner.start(
              { facingMode: "environment" },
              { fps: 10, qrbox: { width: 250, height: 150 } },
              (decodedText) => handleLookup(decodedText, true),
              () => {}
            );
          } catch (err) {
            console.warn("Environment camera failed, falling back.", err);
            await scanner.start(
              devices[0].id,
              { fps: 10, qrbox: { width: 250, height: 150 } },
              (decodedText) => handleLookup(decodedText, true),
              () => {}
            );
          }
        } catch (err: unknown) {
          console.error("Scanner failed:", err);
          setCameraActive(false);
          showAlert('error', 'Action Failed', `Could not start camera: ${(err as Error).message || "Permission denied."}`);
        }
      }, 0);
      
    } catch (err: unknown) {
      console.error(err);
      setCameraActive(false);
      showAlert('error', 'Action Failed', `Could not start camera: ${(err as Error).message || "Permission denied."}`);
    }
  };
  async function handleLookup(code: string, fromCamera: boolean = false) {
    if (isPausedRef.current) return;
    if (!code.trim()) return;

    // Prevent duplicate rapid scans of the same barcode within 400ms
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    if (lastScannedCodeRef.current === code && now - lastScannedTimeRef.current < 400) {
      return;
    }
    lastScannedCodeRef.current = code;
    lastScannedTimeRef.current = now;

    if (fromCamera) setPausedState(true);

    try {
      setNotFoundCode('');

      // Offline: use local Dexie products cache
      const isOffline = !isOnline;
      if (isOffline) {
        try {
          const allProducts = await db.products.toArray();
          const found = allProducts.find((p: OfflineProduct & { uoms?: { barcode?: string | null }[] }) =>
            p.barcode === code || p.sku === code ||
            (p.uoms && p.uoms.some((u: { barcode?: string | null }) => u.barcode === code))
          );
          if (found) {
            setLastScanned({ ...(found as unknown as ScannedProduct), status: 'success' });
            setIsMobileDrawerOpen(true);
          } else {
            setLastScanned(null);
            setNotFoundCode(code);
            setIsMobileDrawerOpen(true);
          }
        } catch (cacheErr) {
          console.warn('Offline cache lookup failed', cacheErr);
          showAlert('error', 'Offline', 'Could not look up product. No local cache available.');
        }
        return;
      }

      const res = await fetch(`/api/products/scan?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const product = await res.json();
        
        if (product.found === false) {
          setLastScanned(null);
          setNotFoundCode(code);
          setIsMobileDrawerOpen(true);
          return;
        }

        if (auditModeRef.current) {
          setAuditItems(prev => {
            const existing = prev.find(p => p.id === product.id);
            const isUomScanned = !!product.scannedUom;
            
            if (existing) {
              return prev.map(p => {
                if (p.id === product.id) {
                  const newPhysical = { ...p.physicalCounts!, uoms: { ...p.physicalCounts!.uoms } };
                  if (isUomScanned) {
                    const uomKey = product.scannedUom!.id || product.scannedUom!.name;
                    newPhysical.uoms[uomKey] = (newPhysical.uoms[uomKey] || 0) + 1;
                  } else {
                    newPhysical.base += 1;
                  }
                  return { 
                    ...p, 
                    physicalCounts: newPhysical,
                    scannedQty: calculateTotalQty(p, newPhysical)
                  };
                }
                return p;
              });
            } else {
              const newPhysical = { base: 0, uoms: {} as Record<string, number> };
              if (isUomScanned) {
                const uomKey = product.scannedUom!.id || product.scannedUom!.name;
                newPhysical.uoms[uomKey] = 0; // User requested: start at 0 not 1
              } else {
                newPhysical.base = 0; // User requested: start at 0 not 1
              }
              const newQty = 0;
              
              return [{ ...product, status: 'success', scannedQty: newQty, physicalCounts: newPhysical }, ...prev];
            }
          });
          setIsMobileDrawerOpen(true);
        } else {
            setLastScanned({
              id: product.id,
              name: product.name,
              sku: product.sku,
              price: product.price,
              stock: product.stock,
              image: product.image,
              unit: product.unit,
              uoms: product.uoms,
              scannedUom: product.scannedUom,
              status: 'success'
            });
            setIsMobileDrawerOpen(true);
        }
      } else {
        setLastScanned(null);
        setNotFoundCode(code);
        setIsMobileDrawerOpen(true);
      }
    } catch (err) {
      console.error(err);
      showAlert('error', 'Action Failed', 'Error scanning product');
    }
  };
  async function handleFormScan(e: React.FormEvent) {
    e.preventDefault();
    await handleLookup(scannedCode, false);
    setScannedCode(''); 
    if (inputRef.current) inputRef.current.focus();
  };

  useEffect(() => {
    if (inputRef.current && !cameraActive && window.innerWidth > 768) {
      inputRef.current.focus();
    }
  }, [cameraActive]);

  useBarcodeScanner({ onScan: (code) => handleLookup(code, false) });



  const stopCamera = () => {
    if (scannerRef.current) {
      try {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        scannerRef.current.stop().catch((e: any) => {
          if (!e?.toString().includes("not running")) console.error(e);
        });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch(e) {}
      scannerRef.current = null;
    }
    setCameraActive(false);
    setPausedState(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);







  return (
    <>
      <style>{`
        /* Hide number spinners for cleaner audit UI */
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
      <div className="page-header">
        <div>
          <h1 className="page-title">Barcode Scanner</h1>
          <p className="page-subtitle">Scan products to quickly lookup or audit your inventory</p>
        </div>
      </div>

      {!isOnline && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', color: '#92400e', fontWeight: 500 }}>⚠️ Offline Mode — Showing local data. Changes will sync when reconnected.</span>
        </div>
      )}

      <div className="scanner-layout" style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))',
        gap: 'var(--space-xl)', 
        alignItems: 'start' 
      }}>
        
        {/* Left Column: Scanner Interface */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl) var(--space-lg)' }}>
          
          {cameraActive ? (
            <div style={{ position: 'relative' }}>
              <div id="reader" style={{ width: '100%', minHeight: '250px' }}></div>
              
              {isPaused && (
                <div 
                  onClick={() => setPausedState(false)}
                  style={{ 
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                    background: 'rgba(0, 0, 0, 0.8)', zIndex: 20, 
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                    color: 'white', cursor: 'pointer', borderRadius: 'var(--radius-md)'
                  }}
                >
                  <CheckCircle2 size={48} color="var(--success)" style={{ marginBottom: '16px' }} />
                  <h3 style={{ fontSize: 'var(--font-lg)', fontWeight: 600 }}>Item Scanned!</h3>
                  <p style={{ opacity: 0.8, marginTop: '8px' }}>Tap anywhere to scan next</p>
                </div>
              )}
              
              <button 
                onClick={stopCamera}
                className="btn btn-outline" 
                style={{ marginTop: 'var(--space-lg)', width: '100%', borderColor: 'var(--danger)', color: 'var(--danger)' }}
              >
                <X size={18} style={{ marginRight: '8px' }} /> Close Camera
              </button>
            </div>
          ) : (
            <>
              <div style={{ 
                width: '80px', height: '80px', 
                borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto var(--space-md)' 
              }}>
                <ScanBarcode size={40} />
              </div>
              <h2 className="card-title" style={{ fontSize: 'var(--font-xl)', marginBottom: 'var(--space-sm)' }}>Hardware Scanner Ready</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>
                Start scanning barcodes now. The system is listening. <br/>
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--primary)' }}><Info size={14} style={{ display: 'inline', marginBottom: '-2px', marginRight: '4px' }} /> USB Barcode Scanners are supported natively (plug and play)</span>
              </p>

              <form onSubmit={handleFormScan} style={{ position: 'relative', maxWidth: '300px', margin: '0 auto var(--space-xl)' }}>
                <input 
                  id="scanner-input"
                  name="scannerInput"
                  aria-label="Scanner input"
                  ref={inputRef}
                  type="text" 
                  className="form-input" 
                  value={scannedCode}
                  onChange={(e) => setScannedCode(e.target.value)}
                  placeholder="Waiting for input..."
                  style={{ 
                    fontSize: 'var(--font-lg)', padding: '16px 24px', 
                    textAlign: 'center', letterSpacing: '2px',
                    border: '2px solid var(--primary)',
                    boxShadow: '0 0 0 4px var(--primary-light)',
                    borderRadius: 'var(--radius-full)'
                  }}
                />
              </form>
            </>
          )}
        </div>

        {/* Alternative Input Methods Card */}
        <div className="card" style={{ padding: 'var(--space-lg)', textAlign: 'center' }}>
          <h3 style={{ fontSize: 'var(--font-md)', fontWeight: 600, marginBottom: 'var(--space-lg)', color: 'var(--text-secondary)' }}>Alternative Input Methods</h3>

              <div ref={fallbackRef} style={{ position: 'relative', width: '100%', maxWidth: '300px', margin: '0 auto' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                  <input
                    id="scanner-fallback-search"
                    name="fallbackSearch"
                    aria-label="Search by Product Name"
                    type="text"
                    className="form-input"
                    placeholder="Search by Product Name..."
                    value={fallbackQuery}
                    onChange={(e) => setFallbackQuery(e.target.value)}
                    onFocus={() => fallbackQuery.trim().length >= 2 && setShowFallbackDropdown(true)}
                    style={{ paddingLeft: '40px', width: '100%', fontSize: 'var(--font-md)', borderRadius: 'var(--radius-full)', padding: '12px 16px 12px 40px' }}
                  />
                  <style>{`
                    @keyframes spin {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                  `}</style>
                  {isSearchingFallback && (
                    <Loader2 size={16} style={{ position: 'absolute', right: '16px', top: '50%', marginTop: '-8px', color: 'var(--primary)', animation: 'spin 0.6s linear infinite' }} />
                  )}
                </div>

                {showFallbackDropdown && (
                  <div style={{ 
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', 
                    background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', 
                    boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)', 
                    zIndex: 50, maxHeight: '300px', overflow: 'auto', textAlign: 'left' 
                  }}>
                    {fallbackResults.length === 0 ? (
                      <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--text-tertiary)' }}>No products found.</div>
                    ) : (
                      fallbackResults.map((product) => (
                        <div 
                          key={product.id} 
                          onClick={() => handleFallbackSelect(product)}
                          style={{ 
                            padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-light)', 
                            cursor: 'pointer', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '12px'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-main)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {product.image ? (
                              <Image width={400} height={400} src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                            ) : (
                              <ImageIcon size={20} color="var(--text-tertiary)" />
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{product.name}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                              <span>SKU: {product.sku}</span>
                              <span style={{ color: product.stock > 0 ? 'var(--success-dark)' : 'var(--danger)' }}>Stock: {product.stock} {product.unit || 'pcs'}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', margin: 'var(--space-lg) 0' }}>
                <span style={{ height: '1px', background: 'var(--border)', flex: 1 }}></span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-sm)', fontWeight: 600 }}>OR</span>
                <span style={{ height: '1px', background: 'var(--border)', flex: 1 }}></span>
              </div>

              <button 
                onClick={startCamera}
                className="btn btn-secondary" 
                style={{ margin: 'var(--space-xl) auto 0', width: '100%', maxWidth: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', gap: '8px', height: 'auto', borderRadius: 'var(--radius-md)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <Camera size={18} />
                  Use Device Camera
                </div>
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', fontWeight: 500 }}>Scan barcodes using your phone or webcam</span>
              </button>
        </div>
        </div>

        {/* Right Column: Scan Results */}
        <div className={`card scanner-right-panel ${isMobileDrawerOpen ? 'mobile-open' : ''}`} style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <div className="mobile-drag-handle"></div>
          {/* Sticky Header Toolbar */}
          <div className="scanner-drawer-header" style={{ flexShrink: 0, paddingBottom: '12px', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {auditMode ? 'Audit Mode' : 'Scan Results'}
                {auditMode && auditItems.length > 0 && <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', marginLeft: '6px' }}>({auditItems.length})</span>}
              </h2>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {(lastScanned || auditItems.length > 0) && (
                  <button 
                    onClick={clearResults}
                    data-tooltip="Clear Results"
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}
                  >
                    <Trash2 size={13} /> Clear
                  </button>
                )}
                <button 
                  onClick={() => setAuditState(!auditMode)}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', border: auditMode ? 'none' : '1px solid var(--border)', background: auditMode ? 'var(--primary)' : 'var(--bg-main)', color: auditMode ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: auditMode ? '0 2px 8px rgba(37,99,235,0.3)' : 'none' }}
                >
                  <ClipboardList size={13} />
                  {auditMode ? 'Exit' : 'Audit'}
                </button>
                <button onClick={() => setIsMobileDrawerOpen(false)} className="mobile-only-close" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-tertiary)', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
          {/* Scrollable Body */}
          <div className="scanner-drawer-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          
          {notFoundCode && (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', background: 'var(--danger-light)', borderRadius: 'var(--radius-md)', marginTop: 'var(--space-lg)' }}>
              <AlertCircle size={48} color="var(--danger)" style={{ margin: '0 auto var(--space-md)' }} />
              <h3 style={{ fontSize: 'var(--font-lg)', fontWeight: 600, color: 'var(--danger-dark)', marginBottom: '8px' }}>Barcode Not Found</h3>
              <p style={{ color: 'var(--danger-dark)' }}>We couldn&apos;t find <strong>{notFoundCode}</strong> in the system.</p>
              <button 
                className="btn btn-primary" 
                style={{ marginTop: 'var(--space-lg)' }}
                onClick={() => router.push(`/inventory?add=true&barcode=${encodeURIComponent(notFoundCode)}`)}
              >
                <Plus size={18} style={{ marginRight: '8px' }} /> Register New Product
              </button>
            </div>
          )}

          {!notFoundCode && auditMode ? (
            <div style={{ marginTop: 'var(--space-md)' }}>
              {auditItems.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-xl) 0' }}>Start scanning to count inventory...</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {auditItems.map(item => {
                    const variance = item.scannedQty - item.stock;
                    const progress = Math.min(100, item.stock > 0 ? (item.scannedQty / item.stock) * 100 : 100);
                    const isComplete = variance === 0;
                    const isOver = variance > 0;
                    const progressColor = isComplete ? 'var(--success)' : isOver ? 'var(--warning)' : 'var(--primary)';
                    
                    return (
                      <div key={item.id} style={{ 
                        background: 'var(--bg-card)', 
                        borderRadius: '12px', 
                        padding: '16px', 
                        border: `1.5px solid ${isComplete && item.scannedQty > 0 ? 'var(--success)' : isOver ? 'var(--warning)' : 'var(--border-light)'}`,
                        transition: 'all 0.2s ease',
                      }}>
                        {/* Product Header — Compact */}
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'var(--bg-main)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {item.image ? (
                              <Image width={400} height={400} src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                            ) : (
                              <ImageIcon size={20} color="var(--text-tertiary)" />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</h3>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>SKU: {item.sku}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, background: 'var(--bg-main)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '2px' }}>Expected Stock</div>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary-dark)' }}>
                              {(() => {
                                if (!item.uoms || item.uoms.length === 0) return `${item.stock} ${item.unit || 'pcs'}`;
                                const sortedUoms = [...item.uoms].sort((a, b) => b.multiplier - a.multiplier);
                                let remaining = item.stock;
                                const parts: string[] = [];
                                for (const uom of sortedUoms) {
                                  const qty = Math.floor(remaining / uom.multiplier);
                                  if (qty > 0) {
                                    parts.push(`${qty} ${pluralize(uom.name, qty)}`);
                                    remaining %= uom.multiplier;
                                  }
                                }
                                if (remaining > 0 || parts.length === 0) {
                                  parts.push(`${remaining} ${pluralize(item.unit || 'pcs', remaining)}`);
                                }
                                return parts.join(' + ');
                              })()}
                            </div>
                          </div>
                        </div>
                        
                        {/* Progress Bar — Slimmer */}
                        <div style={{ width: '100%', height: '4px', background: 'var(--border-light)', borderRadius: '2px', overflow: 'hidden', marginBottom: '12px' }}>
                          <div style={{ width: `${progress}%`, height: '100%', background: progressColor, transition: 'width 0.3s ease' }}></div>
                        </div>

                        {/* Physical Count Inputs — Compact rows */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {/* Base Unit Row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.unit || 'Piece'}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '1px' }}>Base unit</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button style={{ width: '30px', height: '30px', padding: 0, borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.1s' }} onClick={() => updatePhysicalQty(item.id, 'base', '', (item.physicalCounts?.base || 0) - 1)}><Minus size={14}/></button>
                              <input id={`scan-qty-base-${item.id}`} name={`scanQtyBase_${item.id}`} aria-label="Physical count base quantity" type="number" className="form-input" style={{ width: '48px', textAlign: 'center', fontWeight: 700, fontSize: '15px', background: 'transparent', border: 'none', padding: '0 2px' }} value={item.physicalCounts?.base === 0 ? '' : item.physicalCounts?.base} placeholder="0" onChange={e => updatePhysicalQty(item.id, 'base', '', parseInt(e.target.value) || 0)} onWheel={e => (e.target as HTMLElement).blur()} />
                              <button style={{ width: '30px', height: '30px', padding: 0, borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.1s' }} onClick={() => updatePhysicalQty(item.id, 'base', '', (item.physicalCounts?.base || 0) + 1)}><Plus size={14}/></button>
                            </div>
                          </div>
                          
                          {item.uoms?.map((uom: { id?: string, name: string, multiplier: number }) => {
                            const uomKey = uom.id || uom.name;
                            const qty = item.physicalCounts?.uoms[uomKey] || 0;
                            return (
                              <div key={uomKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{uom.name}</div>
                                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '1px' }}>= {uom.multiplier} {item.unit || 'pcs'} each</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <button style={{ width: '30px', height: '30px', padding: 0, borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.1s' }} onClick={() => updatePhysicalQty(item.id, 'uom', uomKey, qty - 1)}><Minus size={14}/></button>
                                  <input id={`scan-qty-uom-${item.id}-${uomKey}`} name={`scanQtyUom_${item.id}_${uomKey}`} aria-label={`Physical count ${uom.name} quantity`} type="number" className="form-input" style={{ width: '48px', textAlign: 'center', fontWeight: 700, fontSize: '15px', background: 'transparent', border: 'none', padding: '0 2px' }} value={qty || ''} placeholder="0" onChange={e => updatePhysicalQty(item.id, 'uom', uomKey, parseInt(e.target.value) || 0)} onWheel={e => (e.target as HTMLElement).blur()} />
                                  <button style={{ width: '30px', height: '30px', padding: 0, borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.1s' }} onClick={() => updatePhysicalQty(item.id, 'uom', uomKey, qty + 1)}><Plus size={14}/></button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Variance Footer — Inline */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            Variance: <span style={{ fontWeight: 700, color: variance === 0 ? 'var(--success)' : (variance > 0 ? 'var(--warning-dark)' : 'var(--danger)') }}>{variance > 0 ? '+' : ''}{variance}</span>
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>
                            Total: {item.scannedQty} {pluralize(item.unit || 'pcs', item.scannedQty)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : !notFoundCode && lastScanned ? (
            <div style={{ padding: 'var(--space-md) 0', animation: 'fadeIn var(--transition-base)' }}>
              <div style={{ 
                background: 'var(--bg-card)', 
                borderRadius: '12px', 
                padding: '16px', 
                border: `1.5px solid var(--border-light)`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: 'var(--space-lg)' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '10px', background: 'var(--bg-main)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {lastScanned.image ? (
                      <Image width={400} height={400} src={lastScanned.image} alt={lastScanned.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                    ) : (
                      <ImageIcon size={24} color="var(--text-tertiary)" />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', margin: 0 }}>
                        {lastScanned.name}
                      </h3>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', margin: '4px 0 0 0' }}>SKU: {lastScanned.sku}</p>
                  </div>
                </div>

                {/* Pricing Section */}
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: '8px', fontWeight: 800 }}>Pricing</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* Base Price Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-main)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--success-dark)' }}>{formatCurrency(lastScanned.price)}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>1 {pluralize(lastScanned.unit || 'Piece', 1)}</div>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--success-dark)', background: 'var(--success-light)', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Base</span>
                    </div>
                    {/* Bulk Price Rows */}
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {lastScanned.uoms && lastScanned.uoms.map((u: any) => (
                      <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-main)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(u.price)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>1 {u.name} ({u.multiplier} {pluralize(lastScanned.unit || 'Piece', u.multiplier)})</div>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', background: 'var(--primary-light)', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{u.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stock Section */}
                <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: '8px', fontWeight: 800 }}>Current Stock</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: lastScanned.stock > 10 ? 'var(--success-dark)' : 'var(--danger-dark)' }}>
                    {(() => {
                      if (!lastScanned.uoms || lastScanned.uoms.length === 0) return `${lastScanned.stock} ${lastScanned.unit || 'Piece'}`;
                      const sortedUoms = [...lastScanned.uoms].sort((a, b) => b.multiplier - a.multiplier);
                      let remaining = lastScanned.stock;
                      const parts: string[] = [];
                      for (const uom of sortedUoms) {
                        const qty = Math.floor(remaining / uom.multiplier);
                        if (qty > 0) {
                          parts.push(`${qty} ${pluralize(uom.name, qty)}`);
                          remaining %= uom.multiplier;
                        }
                      }
                      if (remaining > 0 || parts.length === 0) {
                        parts.push(`${remaining} ${pluralize(lastScanned.unit || 'Piece', remaining)}`);
                      }
                      return parts.join(' + ');
                    })()}
                  </div>
                  {lastScanned.uoms && lastScanned.uoms.length > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', fontWeight: 600 }}>
                      Total: {lastScanned.stock} {pluralize(lastScanned.unit || 'Piece', lastScanned.stock)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-tertiary)' }}>
              <AlertCircle size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
              <p>No item scanned yet.</p>
            </div>
          )}
          </div>{/* end scanner-drawer-body */}

          {/* Sticky Footer — Save & Apply Audit */}
          {auditMode && auditItems.length > 0 && (
            <div className="scanner-drawer-footer" style={{ padding: '16px', borderTop: '1px solid var(--border-light)', background: 'var(--bg-main)' }}>
              <button 
                className="btn btn-primary" 
                onClick={saveAudit} 
                disabled={actionLoading}
                style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}
              >
                {actionLoading ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
                {actionLoading ? 'Saving...' : 'Save & Apply Adjustments'}
              </button>
            </div>
          )}
          {/* Batch Selection Modal for Surplus */}
          {batchSelectionState?.isOpen && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
              <div className="card" style={{ padding: 'var(--space-xl)', width: '100%', maxWidth: '500px', background: 'var(--bg-main)', borderRadius: 'var(--radius-lg)' }}>
                <h3 style={{ fontSize: 'var(--font-lg)', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>Process Surplus Items</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>
                  You have scanned more items than expected. To adjust the stock, they must be assigned to a batch.
                </p>
                
                <div style={{ display: 'flex', gap: '12px', marginTop: 'var(--space-xl)' }}>
                  <button 
                    className="btn btn-primary" 
                    style={{ flex: 1 }}
                    onClick={() => {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const mockSelections: any = {};
                      batchSelectionState.items.forEach(i => {
                        mockSelections[i.id] = { isNew: true, batchNumber: 'AUDIT-' + Date.now().toString().slice(-6), expiryDate: new Date(Date.now() + 31536000000).toISOString() };
                      });
                      submitAudit(auditItems, mockSelections);
                      setBatchSelectionState(null);
                    }}
                  >
                    Auto-Assign to New Batches
                  </button>
                  <button 
                    className="btn btn-outline" 
                    onClick={() => setBatchSelectionState(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Overlay */}
      {isMobileDrawerOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setIsMobileDrawerOpen(false)}></div>
      )}

      {/* Mobile Floating Drawer Button */}
      <div className="mobile-fab-container">
        <button className="mobile-fab" onClick={() => setIsMobileDrawerOpen(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <ClipboardList size={24} />
              {(lastScanned || auditItems.length > 0) && (
                <span style={{ position: 'absolute', top: '-8px', right: '-8px', background: 'var(--danger)', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '100px', border: '2px solid var(--primary)' }}>
                  {auditMode ? auditItems.length : (lastScanned ? 1 : 0)}
                </span>
              )}
            </div>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>
              {auditMode ? 'View Audit List' : 'View Scan Results'}
            </span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800 }}>
            Open Drawer
          </div>
        </button>
      </div>

    </>
  );
}
