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
 * Processes all pending tasks in the syncQueue
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

  // We should process them sequentially to maintain order
  pending.sort((a, b) => a.createdAt - b.createdAt);

  for (const task of pending) {
    try {
      await db.syncQueue.update(task.id!, { syncStatus: 'syncing' });

      const payload = JSON.parse(task.payload);
      payload.isOfflineSync = true;
      payload.idempotencyKey = task.idempotencyKey;

      let endpoint = '';
      let method = task.action === 'CREATE' ? 'POST' : task.action === 'UPDATE' ? 'PUT' : 'DELETE';

      if (task.type === 'order') endpoint = task.action === 'CREATE' ? '/api/orders' : `/api/orders/${payload.id}`;
      else if (task.type === 'customer') endpoint = task.action === 'CREATE' ? '/api/customers' : `/api/customers/${payload.id}`;
      else if (task.type === 'expense') endpoint = task.action === 'CREATE' ? '/api/expenses' : `/api/expenses/${payload.id}`;
      else if (task.type === 'product') endpoint = task.action === 'CREATE' ? '/api/products' : `/api/products/${payload.id}`;
      else if (task.type === 'driver') endpoint = task.action === 'CREATE' ? '/api/drivers' : `/api/drivers/${payload.id}`;
      else if (task.type === 'category') endpoint = task.action === 'CREATE' ? '/api/categories' : `/api/categories/${payload.id}`;
      else if (task.type === 'unit') endpoint = task.action === 'CREATE' ? '/api/units' : `/api/units/${payload.id}`;
      else if (task.type === 'stock') endpoint = task.action === 'CREATE' ? '/api/stock/movement' : `/api/stock/movement/${payload.id}`;
      else if (task.type === 'batch') endpoint = `/api/batches/${payload.id}`;

      if (!endpoint) throw new Error('Unknown sync task type');

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await db.syncQueue.update(task.id!, { syncStatus: 'synced' });
        synced++;
        
        // --- OFFLINE ID REMAPPING ---
        // If this was a CREATE task, the server just generated a real database ID.
        // We need to find any subsequent tasks in the queue that are still referencing 
        // the temporary offline ID (e.g. OFF-1234) and update them to use the real ID.
        if (task.action === 'CREATE') {
          try {
            const createdEntity = await res.json();
            const realId = createdEntity.id;
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
                  
                  // Remap primary ID for UPDATE/DELETE tasks
                  if (ptPayload.id === tempId) {
                    ptPayload.id = realId;
                    modified = true;
                  }
                  
                  // Remap common foreign keys in other tasks
                  if (ptPayload.categoryId === tempId) { ptPayload.categoryId = realId; modified = true; }
                  if (ptPayload.productId === tempId) { ptPayload.productId = realId; modified = true; }
                  if (ptPayload.customerId === tempId) { ptPayload.customerId = realId; modified = true; }
                  if (ptPayload.deliveryDriverId === tempId) { ptPayload.deliveryDriverId = realId; modified = true; }
                  
                  // Remap nested items (e.g. order items)
                  if (Array.isArray(ptPayload.items)) {
                    for (const item of ptPayload.items) {
                      if (item.productId === tempId) {
                        item.productId = realId;
                        modified = true;
                      }
                    }
                  }
                  
                  if (modified) {
                    await db.syncQueue.update(pt.id!, { payload: JSON.stringify(ptPayload) });
                  }
                } catch (e) {}
              }
            }
          } catch (e) {
            console.warn('Failed to remap offline IDs', e);
          }
        }
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        await db.syncQueue.update(task.id!, {
          syncStatus: 'failed',
          syncAttempts: task.syncAttempts + 1,
          lastError: err.error || `HTTP ${res.status}`,
        });
        failed++;
      }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      await db.syncQueue.update(task.id!, {
        syncStatus: 'failed',
        syncAttempts: task.syncAttempts + 1,
        lastError: err.message || 'Network error',
      });
      failed++;
    }
  }

  // Cleanup old synced tasks
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  await db.syncQueue
    .where('syncStatus')
    .equals('synced')
    .and(t => t.createdAt < dayAgo)
    .delete();

  return { synced, failed };
}
