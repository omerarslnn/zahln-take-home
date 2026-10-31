// Scripts only (Node): an IntentStore backed by one JSON file. Every save is written atomically
// (temporary file + rename) and completes before the controller sends the write.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  parseIntent,
  scopeStorageId,
  serializeIntent,
  type IntentRecord,
  type IntentStore,
  type Scope,
  type StoredIntents,
} from '../src/index';

type Contents = Record<string, Record<string, string>>;

export class FileIntentStore implements IntentStore {
  constructor(private readonly file: string) {}

  load(scope: Scope): Promise<StoredIntents> {
    const entries = Object.values(this.read()[scopeStorageId(scope)] ?? {});
    const records = entries.flatMap((json) => parseIntent(json, scope) ?? []);
    return Promise.resolve({ records, unreadable: entries.length - records.length });
  }

  save(record: IntentRecord): Promise<void> {
    const contents = this.read();
    const partition = (contents[scopeStorageId(record.scope)] ??= {});
    partition[record.key] = serializeIntent(record);
    this.write(contents);
    return Promise.resolve();
  }

  remove(scope: Scope, key: string): Promise<void> {
    const contents = this.read();
    delete contents[scopeStorageId(scope)]?.[key];
    this.write(contents);
    return Promise.resolve();
  }

  private read(): Contents {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Contents;
    } catch {
      return {};
    }
  }

  private write(contents: Contents): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(contents, null, 2));
    renameSync(temporary, this.file);
  }
}
