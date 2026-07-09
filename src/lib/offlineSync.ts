import { db, SyncTask } from './db';

/**
 * Adds a task to the generic offline sync queue.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function addSyncTask(
  type: SyncTask['type'],
  action: SyncTask['action'],
  payload: any,
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
  return id as number;
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

    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (res.ok) {
      const data = await res.json();
      return data.url as string;
    }
    return null;
  } catch (e) {
    console.error('Base64 photo upload failed', e);
    return null;
  }
}

/**
 * Processes all pending tasks in the syncQueue.
 * Dispatches browser events on completion:
 *  - 'distritrack:synced'      — at least one task succeeded
 *  - 'distritrack:syncfailed'  — one or more tasks permanently failed
 */
export async function processSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  const pending = await db.syncQueue
    .where('syncStatus')
    .anyOf(['pending', 'failed'])
    .and(t => t.syncAttempts < 15) // Max 15 retries
    .toArray();

  let synced = 0;
  let failed = 0;
  const syncedTypes = new Set<string>();
  const failedDetails: Array<{ type: string; action: string; error: string }> = [];

  // Process sequentially to maintain order
  pending.sort((a, b) => a.createdAt - b.createdAt);

  for (const task of pending) {
    try {
      await db.syncQueue.update(task.id!, { syncStatus: 'syncing' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let payload: any = JSON.parse(task.payload);
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
      const method = task.action === 'CREATE' ? 'POST' : task.action === 'UPDATE' ? 'PUT' : 'DELETE';

      if (task.type === 'order') endpoint = task.action === 'CREATE' ? '/api/orders' : `/api/orders/${payload.id}`;
      else if (task.type === 'customer') endpoint = task.action === 'CREATE' ? '/api/customers' : `/api/customers/${payload.id}`;
      else if (task.type === 'expense') endpoint = task.action === 'CREATE' ? '/api/expenses' : `/api/expenses/${payload.id}`;
      else if (task.type === 'product') endpoint = task.action === 'CREATE' ? '/api/products' : `/api/products/${payload.id}`;
      else if (task.type === 'driver') endpoint = task.action === 'CREATE' ? '/api/drivers' : `/api/drivers/${payload.id}`;
      else if (task.type === 'category') endpoint = task.action === 'CREATE' ? '/api/categories' : `/api/categories/${payload.id}`;
      else if (task.type === 'unit') endpoint = task.action === 'CREATE' ? '/api/units' : `/api/units/${payload.id}`;
      else if (task.type === 'stock') endpoint = task.action === 'CREATE' ? '/api/stock/movement' : `/api/stock/movement/${payload.id}`;
      else if (task.type === 'batch') endpoint = `/api/batches/${payload.id}`;
      else if (task.type === 'delivery') endpoint = `/api/delivery/${payload.id}`;
      else if (task.type === 'settings') endpoint = '/api/settings';

      if (!endpoint) throw new Error('Unknown sync task type');

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Buffer response body ONCE to avoid double-read stream error
      const responseText = await res.text();
      let responseJson: any = null;
      try { responseJson = JSON.parse(responseText); } catch { /* non-JSON response */ }

      if (res.ok) {
        await db.syncQueue.update(task.id!, { syncStatus: 'synced' });
        synced++;
        syncedTypes.add(task.type);
        
        // --- OFFLINE ID REMAPPING ---
        // If this was a CREATE, the server just assigned a real database ID.
        // Find all subsequent pending tasks referencing the temp offline ID and update them.
        if (task.action === 'CREATE' && responseJson) {
          try {
            const realId = responseJson.id;
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
                  
                  // Remap nested order items (productId inside items array)
                  if (Array.isArray(ptPayload.items)) {
                    for (const item of ptPayload.items) {
                      if (item.productId === tempId) { item.productId = realId; modified = true; }
                    }
                  }
                  
                  if (modified) {
                    await db.syncQueue.update(pt.id!, { payload: JSON.stringify(ptPayload) });
                  }
                } catch (e) { /* ignore individual remap errors */ }
              }

              // Also update local Dexie caches so the UI doesn't hold stale temp IDs
              if (task.type === 'customer') {
                await db.customers.where('id').equals(tempId).modify({ id: realId }).catch(() => {});
              } else if (task.type === 'product') {
                await db.products.where('id').equals(tempId).modify({ id: realId }).catch(() => {});
              } else if (task.type === 'driver') {
                await db.drivers.where('id').equals(tempId).modify({ id: realId }).catch(() => {});
              }
            }
          } catch (e) {
            console.warn('Failed to remap offline IDs', e);
          }
        }

        // After syncing settings, also update the local db.settings cache
        if (task.type === 'settings' && responseJson) {
          try {
            await db.settings.put({ key: 'current', data: JSON.stringify(responseJson), lastSynced: Date.now() });
          } catch (e) { /* ignore */ }
        }

      } else {
        const errorMsg = responseJson?.error || `HTTP ${res.status}`;
        await db.syncQueue.update(task.id!, {
          syncStatus: 'failed',
          syncAttempts: task.syncAttempts + 1,
          lastError: errorMsg,
        });
        failed++;
        failedDetails.push({ type: task.type, action: task.action, error: errorMsg });
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const errorMsg = err.message || 'Network error';
      await db.syncQueue.update(task.id!, {
        syncStatus: 'failed',
        syncAttempts: task.syncAttempts + 1,
        lastError: errorMsg,
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
      window.dispatchEvent(new CustomEvent('distritrack:synced', {
        detail: { synced, types: Array.from(syncedTypes) }
      }));
    }
    if (failedDetails.length > 0) {
      window.dispatchEvent(new CustomEvent('distritrack:syncfailed', {
        detail: { failed: failedDetails }
      }));
    }
  }

  return { synced, failed };
}
