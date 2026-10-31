import {
  IntentStorageError,
  parseIntent,
  scopeStorageId,
  serializeIntent,
  type IntentStore,
  type StoredIntents,
} from '../intent-store';
import type { IntentRecord, Scope } from '../intent';

/**
 * In-memory store for tests. It goes through the same serialisation and size check as the real
 * adapters, but it is NOT durable: a real restart loses it. `failNext` injects a storage failure.
 */
export class MemoryIntentStore implements IntentStore {
  private readonly partitions = new Map<string, Map<string, string>>();
  private failures = 0;

  failNext(count = 1): void {
    this.failures = count;
  }

  load(scope: Scope): Promise<StoredIntents> {
    const partition = this.partitions.get(scopeStorageId(scope)) ?? new Map<string, string>();
    const records: IntentRecord[] = [];
    let unreadable = 0;
    for (const json of partition.values()) {
      const parsed = parseIntent(json, scope);
      if (parsed) records.push(parsed);
      else unreadable += 1;
    }
    return Promise.resolve({ records, unreadable });
  }

  save(record: IntentRecord): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new IntentStorageError('write_failed'));
    }
    const json = serializeIntent(record);
    const id = scopeStorageId(record.scope);
    const partition = this.partitions.get(id) ?? new Map<string, string>();
    partition.set(record.key, json);
    this.partitions.set(id, partition);
    return Promise.resolve();
  }

  remove(scope: Scope, key: string): Promise<void> {
    this.partitions.get(scopeStorageId(scope))?.delete(key);
    return Promise.resolve();
  }

  /** Test helper: raw JSON entries of a scope, e.g. to check that nothing sensitive is stored. */
  rawEntries(scope: Scope): string[] {
    return [...(this.partitions.get(scopeStorageId(scope))?.values() ?? [])];
  }

  /** Test helper: overwrite an entry with arbitrary text, e.g. to simulate corruption. */
  corrupt(scope: Scope, key: string, text: string): void {
    const id = scopeStorageId(scope);
    const partition = this.partitions.get(id) ?? new Map<string, string>();
    partition.set(key, text);
    this.partitions.set(id, partition);
  }
}
