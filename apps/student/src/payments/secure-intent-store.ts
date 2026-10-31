// The app's durable IntentStore: Expo SecureStore (iOS Keychain; Android Keystore-encrypted
// storage). The till has an identical copy. SecureStore cannot list its keys, so each scope keeps
// a small index entry next to one entry per record. Limits checked against the installed
// expo-secure-store 15.0.8: keys match /^[\w.-]+$/, values are limited to 2048 bytes
// (serializeIntent enforces it). Records hold IDs, amounts and states only: no token, no password,
// no names, no full server responses.
import {
  IntentStorageError,
  newIntent,
  parseIntent,
  scopeStorageId,
  serializeIntent,
  type IntentRecord,
  type IntentStore,
  type Scope,
} from '@mensa/domain';
import * as SecureStore from 'expo-secure-store';

const PREFIX = 'mensa.intents.v1';
/** Keeps the index entry well below 2048 bytes (UUID keys are 36 characters). */
const MAX_RECORDS_PER_SCOPE = 32;
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'mensa.intents',
  // Readable after the first unlock since boot, and never restored onto another device.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const indexKey = (scopeId: string) => `${PREFIX}.${scopeId}.index`;
const recordKey = (scopeId: string, key: string) => `${PREFIX}.${scopeId}.r.${key}`;

export function createSecureIntentStore(): IntentStore {
  // Operations on one scope run one after another, so two saves cannot both rewrite the index.
  const queues = new Map<string, Promise<unknown>>();
  const serial = <T>(scope: Scope, task: (scopeId: string) => Promise<T>): Promise<T> => {
    const scopeId = scopeStorageId(scope);
    const run = (queues.get(scopeId) ?? Promise.resolve()).then(() => task(scopeId));
    queues.set(
      scopeId,
      run.catch(() => undefined),
    );
    return run;
  };

  return {
    load: (scope) =>
      serial(scope, async (scopeId) => {
        const index = await readIndex(scopeId);
        const records: IntentRecord[] = [];
        // An unreadable index hides every record it lists: count it, so the controller fails
        // closed instead of treating the scope as empty.
        let unreadable = index.corrupt ? 1 : 0;
        for (const key of index.keys) {
          const json = await SecureStore.getItemAsync(recordKey(scopeId, key), OPTIONS);
          if (json === null) continue; // removed record still listed: harmless
          const record = parseIntent(json, scope);
          if (record) records.push(record);
          else unreadable += 1;
        }
        return { records, unreadable };
      }),

    save: (record) =>
      serial(record.scope, async (scopeId) => {
        const json = serializeIntent(record); // throws when the record exceeds 2048 bytes
        const index = await readIndex(scopeId);
        if (index.corrupt) throw new IntentStorageError('write_failed');
        const isNew = !index.keys.includes(record.key);
        if (isNew && index.keys.length >= MAX_RECORDS_PER_SCOPE) {
          throw new IntentStorageError('store_full');
        }
        try {
          // Record first, then index: a crash in between leaves an unlisted record, never a
          // listed one that is missing.
          await SecureStore.setItemAsync(recordKey(scopeId, record.key), json, OPTIONS);
          if (isNew) {
            const keys = JSON.stringify([...index.keys, record.key]);
            await SecureStore.setItemAsync(indexKey(scopeId), keys, OPTIONS);
          }
        } catch {
          throw new IntentStorageError('write_failed');
        }
      }),

    remove: (scope, key) =>
      serial(scope, async (scopeId) => {
        const index = await readIndex(scopeId);
        await SecureStore.deleteItemAsync(recordKey(scopeId, key), OPTIONS);
        if (!index.corrupt && index.keys.includes(key)) {
          const keys = JSON.stringify(index.keys.filter((candidate) => candidate !== key));
          await SecureStore.setItemAsync(indexKey(scopeId), keys, OPTIONS);
        }
      }),
  };
}

async function readIndex(scopeId: string): Promise<{ keys: string[]; corrupt: boolean }> {
  const json = await SecureStore.getItemAsync(indexKey(scopeId), OPTIONS);
  if (json === null) return { keys: [], corrupt: false };
  try {
    const value: unknown = JSON.parse(json);
    if (Array.isArray(value) && value.every((key) => typeof key === 'string')) {
      return { keys: value, corrupt: false };
    }
  } catch {
    // fall through
  }
  return { keys: [], corrupt: true };
}

export type StorageCheck =
  { ok: true; bytes: number } | { ok: false; step: 'save' | 'load' | 'remove' };

/**
 * Diagnostic: saves, reads back and deletes one test record through the real adapter, in a scope
 * of its own. Shows that the native secure storage works on this device and build.
 */
export async function checkSecureStorage(): Promise<StorageCheck> {
  const store = createSecureIntentStore();
  const scope = { candidateId: 'diagnostic', userId: 'storage-check' };
  const record = newIntent(
    { kind: 'payOrder', payload: { orderId: 'ord_storage_check', amountCents: 1 } },
    `check-${Date.now()}`,
    scope,
  );
  try {
    await store.save(record);
  } catch {
    return { ok: false, step: 'save' };
  }
  try {
    const loaded = await store.load(scope);
    if (!loaded.records.some((stored) => stored.key === record.key))
      return { ok: false, step: 'load' };
  } catch {
    return { ok: false, step: 'load' };
  }
  try {
    await store.remove(scope, record.key);
    const after = await store.load(scope);
    if (after.records.some((stored) => stored.key === record.key))
      return { ok: false, step: 'remove' };
  } catch {
    return { ok: false, step: 'remove' };
  }
  return { ok: true, bytes: serializeIntent(record).length };
}
