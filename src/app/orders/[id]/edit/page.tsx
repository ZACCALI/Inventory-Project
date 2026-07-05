'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Plus, Trash2, Save, ShoppingCart, User, ArrowLeft,  X,  Phone, MapPin, Search, Edit, ImagePlus } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { useBarcodeScanner } from '@/lib/useBarcodeScanner';

import Image from "next/image";
interface Customer {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  address: string | null;
}

interface Driver {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  price: number;
  stock: number;
  image?: string | null;
  category?: { name: string } | null;
}

interface LineItem {
  id: number;
  productId: string;
  qty: number;
  price: number;
}

const ORDER_REFERENCES = [
  'Regular Order',
  'Rush Order',
  'Pre-Order',
  'Bulk Order',
  'Sample Order',
  'Consignment',
  'Return/Exchange',
];

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: session } = useSession();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  
  const [items, setItems] = useState<LineItem[]>([
    { id: 1, productId: '', qty: 1, price: 0 }
  ]);
  const [loading, setLoading] = useState(false);
  const [discount, setDiscount] = useState(0);

  const [categories, setCategories] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [deliveryDriverName, setDeliveryDriverName] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');

  // Checkout & Receipt State removed for Edit page
 
 
// const [receiptData, setReceiptData] = useState<any>(null);

  // Alert Modal
  const [alertModal, setAlertModal] = useState<{isOpen: boolean; title: string; message: string}>({isOpen: false, title: '', message: ''});

  // Edit Product Image Modal
  const [editImageModal, setEditImageModal] = useState<{isOpen: boolean; productId: string; productName: string; currentImage: string}>({isOpen: false, productId: '', productName: '', currentImage: ''});

  async function fetchDrivers() {
    try {
      const res = await fetch('/api/drivers');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setDrivers(data);
        else setDrivers([]);
      }
    } catch (e) { console.error('Failed to fetch drivers', e); }
  }

  async function fetchCustomers() {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (e) { console.error('Failed to fetch customers', e); }
  }

  async function fetchProducts() {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
        const cats = Array.from(new Set(data.filter((p: Product) => p.category).map((p: Product) => p.category!.name)));
        setCategories(['All', ...cats as string[]]);
      }
    } catch (e) { console.error('Failed to fetch products', e); }
  }

  async function fetchOrder() {
    try {
      const res = await fetch(`/api/orders/${id}`);
      if (res.ok) {
        const order = await res.json();
        setSelectedCustomerId(order.customerId || '');
        setOrderNotes(order.notes || '');
        setDiscount(order.discount || 0);
        setDeliveryDriverName(order.delivery?.driverName || '');
        setDeliveryDate(order.delivery?.scheduledDate ? new Date(order.delivery.scheduledDate).toISOString().split('T')[0] : '');
        if (order.items && order.items.length > 0) {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
          setItems(order.items.map((i: any, idx: number) => ({
            id: Date.now() + idx,
            productId: i.productId,
            qty: i.quantity,
            price: i.price
          })));
        }
      }
    } catch (e) { console.error('Failed to fetch order', e); }
  }

  async function handleSaveChanges() {
    const validItems = items.filter(i => i.productId && i.qty > 0);
    
    if (validItems.length === 0) {
      setAlertModal({isOpen: true, title: 'No Items', message: 'Please add at least one valid product.'});
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          discount: discount,
          items: validItems,
          notes: orderNotes,
        })
      });

      if (res.ok) {
        router.push('/orders');
      } else {
        const err = await res.json();
        setAlertModal({isOpen: true, title: 'Save Failed', message: err.error || 'Unknown error'});
      }
    } catch (e) {
      console.error(e);
      setAlertModal({isOpen: true, title: 'Error', message: 'Error saving order'});
    } finally {
      setLoading(false);
    }
  }

  async function handleEditProductImage(file: File) {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      try {
        const res = await fetch(`/api/products/${editImageModal.productId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 })
        });
        if (res.ok) {
          setEditImageModal(prev => ({...prev, isOpen: false}));
          fetchProducts(); 
        } else {
          setAlertModal({isOpen: true, title: 'Error', message: 'Failed to update product image.'});
        }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        setAlertModal({isOpen: true, title: 'Error', message: 'Error uploading image.'});
      }
    };
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    fetchCustomers();
    fetchProducts();
    fetchDrivers();
    fetchOrder();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);







// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isReady: isHardwareScannerReady } = useBarcodeScanner({
    onScan: (barcode) => {
      handleBarcodeScanned(barcode);
    }
  });

  const handleBarcodeScanned = (barcode: string) => {
    const prod = products.find(p => p.sku === barcode || p.barcode === barcode);
    if (!prod) {
      console.warn(`Product with barcode ${barcode} not found.`);
      return;
    }
    
    setItems(prevItems => {
      const newItems = [...prevItems];
      const existingIdx = newItems.findIndex(i => i.productId === prod.id);
      
      if (existingIdx >= 0) {
        newItems[existingIdx].qty += 1;
      } else {
        const lastItem = newItems[newItems.length - 1];
        if (lastItem && !lastItem.productId) {
          lastItem.productId = prod.id;
          lastItem.price = prod.price;
          lastItem.qty = 1;
        } else {
          newItems.push({ id: Date.now(), productId: prod.id, qty: 1, price: prod.price });
        }
      }
      return newItems;
    });
  };

  const addItem = () => {
    setItems([...items, { id: Date.now(), productId: '', qty: 1, price: 0 }]);
  };

  const removeItem = (id: number) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateItem = (id: number, field: keyof LineItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const newItem = { ...item, [field]: value };
        if (field === 'productId') {
          const prod = products.find(p => p.id === value);
          if (prod) newItem.price = prod.price;
        }
        return newItem;
      }
      return item;
    }));
  };

  const subtotal = items.reduce((sum, item) => sum + (item.qty * item.price), 0);
  const total = Math.max(0, subtotal - discount);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  // handleProceedToPayment removed for edit page




  return (
    <>
      <div className="no-print">
        <div className="page-header">
          <div>
            <h1 className="page-title">Edit Order Items</h1>
            <p className="page-subtitle">Modify the items and quantities for this order</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => router.push('/orders')} className="btn btn-outline" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ArrowLeft size={18} /> Cancel
            </button>
            <button onClick={handleSaveChanges} className="btn btn-primary" style={{ display: 'flex', gap: '8px', alignItems: 'center' }} disabled={loading}>
              <Save size={18} /> {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="card-header">
          <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={18} color="var(--primary)" />
            Customer Information
          </h2>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="edit-order-customer" className="form-label">Select Customer *</label>
            <select 
              id="edit-order-customer"
              name="customerId"
              className="form-select" 
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
            >
              <option value="">-- Choose a customer --</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="edit-order-date" className="form-label">Order Date</label>
            <input id="edit-order-date" name="orderDate" type="date" className="form-input" disabled defaultValue={new Date().toISOString().split('T')[0]} />
          </div>
          <div className="form-group col-span-full">
            <label htmlFor="edit-order-reference" className="form-label">Order Reference / Type</label>
            <select 
              id="edit-order-reference"
              name="orderReference"
              className="form-select"
              value={orderNotes}
              onChange={e => setOrderNotes(e.target.value)}
            >
              <option value="">-- Select Reference --</option>
              {ORDER_REFERENCES.map(ref => (
                <option key={ref} value={ref}>{ref}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Auto-populated Customer Details */}
        {selectedCustomer && (
          <div className="responsive-grid-3" style={{ padding: '16px', background: 'var(--bg-main)', borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contact Person</div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{selectedCustomer.contactPerson || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phone</div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Phone size={14} color="var(--text-secondary)" />
                {selectedCustomer.phone || '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Address</div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} color="var(--text-secondary)" />
                {selectedCustomer.address || '—'}
              </div>
            </div>
          </div>
        )}

        <div className="form-row" style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-main)', borderTop: '1px solid var(--border)' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="edit-order-driver" className="form-label">Assign Delivery Driver (Optional)</label>
            <select 
              id="edit-order-driver"
              name="deliveryDriverName"
              className="form-select" 
              value={deliveryDriverName}
              onChange={e => setDeliveryDriverName(e.target.value)}
            >
              <option value="">-- No driver assigned --</option>
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {drivers.filter((d: any) => d.status === 'active' || d.name === deliveryDriverName).map((d: any) => (
                <option key={d.id} value={d.name}>{d.name}{d.status !== 'active' ? ' (Inactive)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="edit-order-delivery-date" className="form-label">Scheduled Delivery Date (Optional)</label>
            <input 
              id="edit-order-delivery-date"
              name="deliveryDate"
              type="date" 
              className="form-input" 
              value={deliveryDate}
              onChange={e => setDeliveryDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="card-header">
          <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingCart size={18} color="var(--primary)" />
            Order Items
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '12px', padding: '16px', background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input 
              id="edit-order-product-search"
              name="productSearch"
              aria-label="Search products"
              type="text" 
              className="form-input" 
              placeholder="Search products..." 
              value={productSearch} 
              onChange={e => setProductSearch(e.target.value)} 
              style={{ paddingLeft: '36px' }}
            />
          </div>
          <select 
            id="edit-order-category-filter"
            name="categoryFilter"
            aria-label="Filter by category"
            className="form-select" 
            value={categoryFilter} 
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ width: '200px' }}
          >
            {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
          </select>
        </div>
        
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Product</th>
                <th style={{ width: '15%' }}>Quantity</th>
                <th style={{ width: '15%' }}>Unit Price</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Total</th>
                <th style={{ width: '15%', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const selectedProduct = products.find(p => p.id === item.productId);
                return (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td data-label="Product" style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Product Image */}
                      {selectedProduct && (
                        <div style={{ width: '44px', height: '44px', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
                          {selectedProduct.image ? (
                            <Image width={400} height={400} src={selectedProduct.image} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                          ) : (
                            <ShoppingCart size={18} color="var(--text-tertiary)" opacity={0.4} />
                          )}
                        </div>
                      )}
                      <select 
                        id={`edit-order-item-product-${item.id}`}
                        name={`itemProduct_${item.id}`}
                        aria-label="Select Product"
                        className="form-select" 
                        value={item.productId}
                        onChange={(e) => updateItem(item.id, 'productId', e.target.value)}
                        style={{ flex: 1 }}
                      >
                        <option value="">Select Product...</option>
                        {products.filter(p => {
                          if (item.productId === p.id) return true;
                          const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase());
                          const matchesCategory = categoryFilter === 'All' || p.category?.name === categoryFilter;
                          return matchesSearch && matchesCategory;
                        }).map(p => (
                          <option key={p.id} value={p.id}>{p.name} (SKU: {p.sku}) - {p.stock} in stock</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td data-label="Quantity" style={{ padding: '12px 16px' }}>
                    <input 
                      id={`edit-order-item-qty-${item.id}`}
                      name={`itemQty_${item.id}`}
                      aria-label="Quantity"
                      type="number" 
                      min="1"
                      className="form-input" 
                      value={item.qty || ''}
                      onChange={(e) => updateItem(item.id, 'qty', parseInt(e.target.value) || 0)}
                    />
                  </td>
                  <td data-label="Unit Price" style={{ padding: '12px 16px' }}>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-tertiary)' }}>₱</span>
                      <input 
                        id={`edit-order-item-price-${item.id}`}
                        name={`itemPrice_${item.id}`}
                        aria-label="Unit Price"
                        type="number" 
                        step="0.01"
                        className="form-input" 
                        style={{ paddingLeft: '24px' }}
                        value={item.price}
                        onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </td>
                  <td data-label="Total" style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, verticalAlign: 'middle' }}>
                    {formatCurrency(item.qty * item.price)}
                  </td>
                  <td data-label="Actions" style={{ padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      {selectedProduct && (
                        <button 
                          className="btn btn-icon btn-ghost" 
                          title="Edit product image"
                          onClick={() => setEditImageModal({isOpen: true, productId: selectedProduct.id, productName: selectedProduct.name, currentImage: selectedProduct.image || ''})}
                          style={{ color: 'var(--primary)' }}
                        >
                          <Edit size={16} />
                        </button>
                      )}
                      <button 
                        className="btn btn-icon btn-ghost" 
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}
                        style={{ color: items.length === 1 ? 'var(--text-tertiary)' : 'var(--danger)' }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '16px' }}>
            <button className="btn btn-secondary btn-sm" onClick={addItem} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Plus size={16} /> Add Line Item
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div className="card" style={{ width: '100%', maxWidth: '350px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: 'var(--text-secondary)' }}>
            <span>Subtotal</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Discount (₱)</span>
            <input 
              id="edit-order-discount"
              name="discount"
              aria-label="Discount amount"
              type="number" 
              className="form-input" 
              style={{ width: '100px', padding: '4px 8px', height: '32px', textAlign: 'right' }} 
              value={discount || ''} 
              onChange={e => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
              placeholder="0.00"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '16px', borderTop: '2px solid var(--border)', fontSize: 'var(--font-xl)', fontWeight: 700 }}>
            <span>Total</span>
            <span style={{ color: 'var(--primary)' }}>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>
      </div> {/* End .no-print wrapper */}

      {/* Checkout and Receipt Modals removed for edit page */}

      {/* Alert Modal */}
      {alertModal.isOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '380px' }}>
            <div className="modal-header">
              <h2 className="modal-title">{alertModal.title}</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setAlertModal(prev => ({...prev, isOpen: false}))}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{alertModal.message}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setAlertModal(prev => ({...prev, isOpen: false}))}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Image Modal */}
      {editImageModal.isOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ImagePlus size={20} color="var(--primary)" />
                Edit Product Image
              </h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setEditImageModal(prev => ({...prev, isOpen: false}))}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '16px', fontWeight: 600 }}>{editImageModal.productName}</p>
              
              {editImageModal.currentImage && (
                <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                  <Image width={400} height={400} src={editImageModal.currentImage} alt="Current" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '12px', border: '1px solid var(--border)' }}  />
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>Current Image</p>
                </div>
              )}
              
              <label htmlFor="edit-order-image-upload" style={{ 
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                height: '120px', border: '2px dashed var(--border)', borderRadius: '12px', cursor: 'pointer',
                color: 'var(--text-secondary)', background: 'var(--bg-main)', transition: 'border-color 0.2s'
              }}>
                <ImagePlus size={28} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <span style={{ fontSize: '14px', fontWeight: 500 }}>Click to upload new image</span>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>JPG, PNG up to 2MB</span>
                <input 
                  id="edit-order-image-upload"
                  name="imageUpload"
                  aria-label="Upload new image"
                  type="file" 
                  accept="image/jpeg, image/png, image/webp" 
                  style={{ display: 'none' }} 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleEditProductImage(file);
                  }} 
                />
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditImageModal(prev => ({...prev, isOpen: false}))}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
