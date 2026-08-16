import { db, SyncTask } from './db';
import { broadcastDataChange } from './constants';

const LOCK_KEY = 'amroding_sync_lock';
const LOCK_TIMEOUT = 30000; // 30s

function acquireLocalStorageLock(): boolean {
  const existing = localStorage.getItem(LOCK_KEY);
  if (existing) {
    const lockTime = parseInt(existing, 10);
    if (Date.now() - lockTime < LOCK_TIMEOUT) return false; // lock held
  }
  localStorage.setItem(LOCK_KEY, String(Date.now()));
  return true;
}

function releaseLocalStorageLock() {
  localStorage.removeItem(LOCK_KEY);
}

/**
 * Adds a task to the generic offline sync queue.
 */
 
export async function addSyncTask(
  type: SyncTask['type'],
  action: SyncTask['action'],
  payload: unknown,
  idempotencyKey?: string
): Promise<number | null> {
  const key = idempotencyKey || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  
  // Deduplication check
  const existing = await db.syncQueue.where('idempotencyKey').equals(key).first();
  if (existing) {
    console.warn(`Duplicate sync task detected (key: ${key}). Skipping.`);
    return null;
  }

  const id = await db.syncQueue.add({
    type,
    action,
    payload: JSON.stringify(payload),
    createdAt: Date.now(),
    syncStatus: 'pending',
    syncAttempts: 0,
    lastError: null,
    idempotencyKey: key,
  });

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if ('sync' in registration) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (registration as any).sync.register('sync-offline-queue');
      }
    } catch (e) {
      console.warn('Background sync registration failed', e);
    }
  }

  // Trigger real-time UI refresh for the new queue count and local data overrides
  broadcastDataChange('offlineSyncTaskAdded');

  return id as number;
}

// Global auto-sync when browser network connectivity returns
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    processSyncQueue(true).catch((err) => console.warn('Auto-sync on online event failed', err));
  });
}

/**
 * Upload a Base64-encoded photo to the server and return its URL.
 * Used for proof-of-delivery and avatar uploads queued while offline.
 */
async function uploadBase64Photo(base64: string): Promise<string | null> {
  try {
    // Convert base64 data URL to a Blob
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    const blob = new Blob([u8arr], { type: mime });

    const formData = new FormData();
    formData.append('file', blob, 'offline-photo.jpg');
    formData.append('isOfflineSync', 'true');

    const res = await fetch('/api/upload', { 
      method: 'POST', 
      credentials: 'same-origin',
      headers: { 
        'X-Offline-Sync': '1',
        'x-offline-sync': 'true',
      },
      body: formData 
    });
    if (res.ok) {
      const data = await res.json();
      return data.url as string;
    }
    throw new Error('Photo upload failed: HTTP ' + res.status);
  } catch (e: unknown) {
    const err = e as Error;
    console.error('Base64 photo upload failed', err);
    throw new Error(err.message || 'Base64 photo upload failed');
  }
}

/**
 * Processes all pending tasks in the syncQueue.
 * Dispatches browser events on completion:
 *  - 'amroding:synced'      — at least one task succeeded
 *  - 'amroding:syncfailed'  — one or more tasks permanently failed
 */
export async function processSyncQueue(force: boolean = false): Promise<{ synced: number; failed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  // Pre-clean stale 'syncing' tasks immediately so UI counts and sync runs don't get stuck
  try {
    await db.syncQueue.where('syncStatus').equals('syncing').modify({ 
      syncStatus: 'pending', 
      lastError: 'Recovered from interrupted sync' 
    });
  } catch (e) { /* ignore */ }

  // CROSS-TAB LOCKING: Ensure only one tab processes the queue
  let result = { synced: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && navigator.locks) {
    try {
      await navigator.locks.request('amroding-sync-lock', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          console.log('Another tab is already syncing. Skipping.');
          return; // Lock not acquired, another tab is syncing
        }
        result = await _processQueueInternal(force);
      });
    } catch (lockErr) {
      console.warn('Web Locks failed, falling back to localStorage lock', lockErr);
      if (acquireLocalStorageLock()) {
        try {
          result = await _processQueueInternal(force);
        } finally {
          releaseLocalStorageLock();
        }
      }
    }
  } else if (typeof window !== 'undefined' && window.localStorage) {
    if (acquireLocalStorageLock()) {
      try {
        result = await _processQueueInternal(force);
      } finally {
        releaseLocalStorageLock();
      }
    } else {
      console.log('Another tab is already syncing (localStorage lock). Skipping.');
    }
  } else {
    result = await _processQueueInternal(force); // Fallback if Web Locks API and localStorage are unsupported
  }
  return result;
}

async function _processQueueInternal(force: boolean = false): Promise<{ synced: number; failed: number }> {
  // Reset any tasks orphaned in 'syncing' state (e.g. from a crash/tab close mid-sync)
  await db.syncQueue.where('syncStatus').equals('syncing').modify({ 
    syncStatus: 'pending', 
    lastError: 'Recovered from interrupted sync' 
  });

  if (force) {
    // Clear retry backoff and restore failed items (that aren't permanent 999 errors) to pending
    await db.syncQueue
      .where('syncStatus')
      .equals('failed')
      .and(t => t.syncAttempts < 999)
      .modify({ syncStatus: 'pending', nextRetryAfter: undefined });
  }

  const pending = await db.syncQueue
    .where('syncStatus')
    .anyOf(['pending', 'failed'])
    .and(t => t.syncAttempts < 999 && (force || !t.nextRetryAfter || t.nextRetryAfter <= Date.now()))
    .toArray();

  let synced = 0;
  let failed = 0;
  const syncedTypes = new Set<string>();
  const failedDetails: Array<{ type: string; action: string; error: string }> = [];

  // Pre-populate from existing permanently failed tasks (persists across sync runs)
  const existingFailures = await db.syncQueue
    .where('syncAttempts').aboveOrEqual(15)
    .toArray();
  const permanentlyFailedIds = new Set<string>();
  for (const ft of existingFailures) {
    try {
      const ftPayload = JSON.parse(ft.payload);
      if (ftPayload.id && String(ftPayload.id).startsWith('OFF-')) {
        permanentlyFailedIds.add(ftPayload.id);
      }
    } catch { /* ignore */ }
  }

  // Process sequentially to maintain order
  pending.sort((a, b) => a.createdAt - b.createdAt);

  for (const task of pending) {
    try {
      // Reload task from database to pick up any remapped IDs (e.g. customerId) updated by previous loop iterations
      const freshTask = await db.syncQueue.get(task.id!);
      if (!freshTask || freshTask.syncStatus === 'synced') continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = JSON.parse(freshTask.payload);

      // CASCADING FAILURE PREVENTION
      // If a parent task permanently failed, this task might depend on it.
      // We check if this task uses a temp ID that belongs to a failed parent.
      if (permanentlyFailedIds.size > 0) {
        const hasFailedDependency = permanentlyFailedIds.has(payload.id) || 
          permanentlyFailedIds.has(payload.categoryId) ||
          permanentlyFailedIds.has(payload.productId) ||
          permanentlyFailedIds.has(payload.customerId) ||
          permanentlyFailedIds.has(payload.driverId) ||
          permanentlyFailedIds.has(payload.deliveryDriverId) ||
          permanentlyFailedIds.has(payload.orderId) ||
          (Array.isArray(payload.items) && payload.items.some((i: { productId?: string }) => permanentlyFailedIds.has(i.productId || '')));
          
        if (hasFailedDependency) {
           await db.syncQueue.update(task.id!, { 
             syncStatus: 'failed', 
             syncAttempts: 999, 
             lastError: 'Cancelled due to dependency failure' 
           });
           failed++;
           permanentlyFailedIds.add(payload.id); // Add this ID too, in case of deeper chains
           continue;
        }
      }

      await db.syncQueue.update(task.id!, { syncStatus: 'syncing' });

      payload.isOfflineSync = true;
      payload.idempotencyKey = task.idempotencyKey;

      // --- PHOTO UPLOAD PRE-STEP ---
      // If this task has a queued Base64 photo, upload it first and replace with URL
      if (payload.proofPhotoBase64) {
        const uploadedUrl = await uploadBase64Photo(payload.proofPhotoBase64);
        if (uploadedUrl) {
          payload.proofPhoto = uploadedUrl;
        }
        delete payload.proofPhotoBase64;
      }
      if (payload.avatarBase64) {
        const uploadedUrl = await uploadBase64Photo(payload.avatarBase64);
        if (uploadedUrl) {
          payload.avatar = uploadedUrl;
        }
        delete payload.avatarBase64;
      }

      let endpoint = '';
      let method = task.action === 'CREATE' ? 'POST' : task.action === 'UPDATE' ? 'PUT' : 'DELETE';

      if (task.type === 'order') {
        endpoint = task.action === 'CREATE' ? '/api/orders' : `/api/orders/${payload.id}`;
      } else if (task.type === 'customer') {
        if (payload._profileUpdate) {
          endpoint = `/api/users/${payload.id}/profile`;
          method = 'PUT';
        } else {
          endpoint = task.action === 'CREATE' ? '/api/customers' : `/api/customers/${payload.id}`;
        }
      } else if (task.type === 'expense') {
        endpoint = task.action === 'CREATE' ? '/api/expenses' : `/api/expenses/${payload.id}`;
      } else if (task.type === 'product') {
        endpoint = task.action === 'CREATE' ? '/api/products' : `/api/products/${payload.id}`;
      } else if (task.type === 'driver') {
        endpoint = task.action === 'CREATE' ? '/api/drivers' : `/api/drivers/${payload.id}`;
      } else if (task.type === 'category') {
        endpoint = task.action === 'CREATE' ? '/api/categories' : `/api/categories/${payload.id}`;
      } else if (task.type === 'unit') {
        endpoint = task.action === 'CREATE' ? '/api/units' : `/api/units/${payload.id}`;
      } else if (task.type === 'stock') {
        endpoint = task.action === 'CREATE' ? '/api/stock/movement' : `/api/stock/movement/${payload.id}`;
      } else if (task.type === 'batch') {
        endpoint = `/api/batches/${payload.id}`;
        method = 'PUT';
      } else if (task.type === 'delivery') {
        endpoint = task.action === 'CREATE' ? '/api/delivery' : `/api/delivery/${payload.id}`;
        if (task.action === 'UPDATE') method = 'PUT';
      } else if (task.type === 'settings') {
        endpoint = '/api/settings';
        method = 'PUT';
      } else if (task.type === 'payment') {
        endpoint = `/api/orders/${payload.orderId}/payments`;
        method = 'POST';
      }

      if (!endpoint) throw new Error(`Unknown sync task type: ${task.type}`);

      const res = await fetch(endpoint, {
        method,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Sync': '1',
          'x-offline-sync': 'true',
        },
        body: JSON.stringify(payload),
      });

      // SESSION EXPIRY LOCKOUT
      if (res.status === 401) {
        console.warn('Session expired. Halting sync queue.');
        await db.syncQueue.update(task.id!, { syncStatus: 'pending' });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('amroding:session-expired', {
            detail: { reason: 'Session expired during offline sync. Please log in again.' }
          }));
        }
        break;
      }

      // Buffer response body ONCE to avoid double-read stream error
      let responseText = '';
      if (res.status !== 204 && res.headers.get('content-length') !== '0') {
        responseText = await res.text();
      }
      let responseJson: unknown = null;
      if (responseText) {
        try { responseJson = JSON.parse(responseText); } catch { /* non-JSON response */ }
      }
      const responseJsonData = responseJson as { id?: string; orderNumber?: string; createdAt?: string; error?: string; message?: string } | null;

      if (res.ok) {
        await db.syncQueue.update(task.id!, { syncStatus: 'synced', lastError: null });
        synced++;
        syncedTypes.add(task.type);
        
        // --- OFFLINE ID REMAPPING ---
        // If this was a CREATE, the server just assigned a real database ID.
        // Find all subsequent pending tasks referencing the temp offline ID and update them.
        if (task.action === 'CREATE' && responseJsonData) {
          try {
            const realId = responseJsonData.id;
            const tempId = payload.id;
            
            if (realId && tempId && String(tempId).startsWith('OFF-')) {
              const pendingTasks = await db.syncQueue
                .where('syncStatus')
                .anyOf(['pending', 'failed'])
                .toArray();
                
              for (const pt of pendingTasks) {
                try {
                  const ptPayload = JSON.parse(pt.payload);
                  let modified = false;
                  
                  // Remap primary ID for UPDATE/DELETE tasks on this entity
                  if (ptPayload.id === tempId) { ptPayload.id = realId; modified = true; }
                  
                  // Remap common foreign keys in other entity tasks
                  if (ptPayload.categoryId === tempId) { ptPayload.categoryId = realId; modified = true; }
                  if (ptPayload.productId === tempId) { ptPayload.productId = realId; modified = true; }
                  if (ptPayload.customerId === tempId) { ptPayload.customerId = realId; modified = true; }
                  if (ptPayload.driverId === tempId) { ptPayload.driverId = realId; modified = true; }
                  if (ptPayload.deliveryDriverId === tempId) { ptPayload.deliveryDriverId = realId; modified = true; }
                  if (ptPayload.orderId === tempId) { ptPayload.orderId = realId; modified = true; }
                  
                  // Remap expense foreign keys  
                  if (ptPayload.expenseId === tempId) { ptPayload.expenseId = realId; modified = true; }
                  // Remap batch references
                  if (ptPayload.batchId === tempId) { ptPayload.batchId = realId; modified = true; }
                  if (ptPayload.forceBatchId === tempId) { ptPayload.forceBatchId = realId; modified = true; }
                  if (ptPayload.targetBatchId === tempId) { ptPayload.targetBatchId = realId; modified = true; }
                  
                  // Remap nested order items (productId inside items array)
                  if (Array.isArray(ptPayload.items)) {
                    for (const item of ptPayload.items) {
                      if (item.productId === tempId) { item.productId = realId; modified = true; }
                    }
                  }
                  
                  if (modified) {
                    await db.syncQueue.update(pt.id!, { payload: JSON.stringify(ptPayload) });
                  }
                } catch { /* ignore individual remap errors */ }
              }

              // Also update local Dexie caches so the UI doesn't hold stale temp IDs
              if (task.type === 'customer') {
                await db.customers.where('id').equals(tempId).modify({ id: realId }).catch(() => {});
              } else if (task.type === 'product') {
                await db.products.where('id').equals(tempId).modify({ id: realId }).catch(() => {});
              } else if (task.type === 'driver') {
                await db.drivers.where('id').equals(tempId).modify({ id: realId }).catch(() => {});
              } else if (task.type === 'category') {
                await db.categories.where('id').equals(tempId).modify({ id: realId }).catch(() => {});
              } else if (task.type === 'order') {
                if (typeof window !== 'undefined') {
                   window.dispatchEvent(new CustomEvent('orderSynced', {
                     detail: {
                       tempId,
                       realId,
                       orderNumber: responseJsonData.orderNumber || responseJsonData.id,
                       createdAt: responseJsonData.createdAt
                     }
                   }));
                }
                // Try to update orders table if it exists in DB (even if not strongly typed)
                try {
                  if (db.tables.some(t => t.name === 'orders')) {
                     await db.table('orders').where('id').equals(tempId).modify({ id: realId, orderNumber: responseJsonData.orderNumber || responseJsonData.id, createdAt: responseJsonData.createdAt }).catch(() => {});
                  }
                } catch {}
              }
            }
          } catch (e) {
            console.warn('Failed to remap offline IDs', e);
          }
        }

        // After syncing settings, also update the local db.settings cache
        if (task.type === 'settings' && responseJsonData) {
          try {
            await db.settings.put({ key: 'current', data: JSON.stringify(responseJsonData), lastSynced: Date.now() });
          } catch { /* ignore */ }
        }

      } else {
        const errorMsg = responseJsonData?.error || responseJsonData?.message || `HTTP ${res.status}`;
        
        // PERMANENT FAILURE HANDLING (4xx errors)
        const isPermanentError = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
        const finalAttempts = isPermanentError ? 999 : task.syncAttempts + 1;
        
        if (isPermanentError && payload.id && String(payload.id).startsWith('OFF-')) {
           permanentlyFailedIds.add(payload.id); // Mark this temp ID as failed so children are canceled
        }

        let nextRetryAfter: number | undefined;
        if (!isPermanentError) {
          const backoffMs = Math.min(Math.pow(2, task.syncAttempts) * 5000, 300000);
          nextRetryAfter = Date.now() + backoffMs;
        }

        await db.syncQueue.update(task.id!, {
          syncStatus: 'failed',
          syncAttempts: finalAttempts,
          lastError: errorMsg,
          ...(nextRetryAfter ? { nextRetryAfter } : {})
        });
        failed++;
        failedDetails.push({ type: task.type, action: task.action, error: errorMsg });
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const errorMsg = err.message || 'Network error';
      const backoffMs = Math.min(Math.pow(2, task.syncAttempts) * 5000, 300000);
      await db.syncQueue.update(task.id!, {
        syncStatus: 'failed',
        syncAttempts: task.syncAttempts + 1,
        lastError: errorMsg,
        nextRetryAfter: Date.now() + backoffMs,
      });
      failed++;
      failedDetails.push({ type: task.type, action: task.action, error: errorMsg });
    }
  }

  // Cleanup old synced tasks (older than 24h)
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  await db.syncQueue
    .where('syncStatus')
    .equals('synced')
    .and(t => t.createdAt < dayAgo)
    .delete();

  // --- DISPATCH BROWSER EVENTS for UI to react ---
  if (typeof window !== 'undefined') {
    if (synced > 0) {
      window.dispatchEvent(new CustomEvent('amroding:synced', {
        detail: { synced, types: Array.from(syncedTypes) }
      }));
      window.dispatchEvent(new CustomEvent('appDataSynced'));
      broadcastDataChange('offlineSync');
    }
    if (failedDetails.length > 0) {
      window.dispatchEvent(new CustomEvent('amroding:syncfailed', {
        detail: { failed: failedDetails }
      }));
    }
  }

  return { synced, failed };
}
