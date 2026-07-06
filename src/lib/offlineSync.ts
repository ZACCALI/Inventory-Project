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
    .and(t => t.syncAttempts < 3) // Max 3 retries
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

      if (!endpoint) throw new Error('Unknown sync task type');

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await db.syncQueue.update(task.id!, { syncStatus: 'synced' });
        synced++;
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
