import Dexie, { type EntityTable } from 'dexie';
import { validateDocument, type WebFretDocument } from './model';

const db = new Dexie('webfret') as Dexie & { documents: EntityTable<WebFretDocument, 'id'> };
db.version(1).stores({ documents: 'id, updatedAt, title' });
const pending = new Map<string, Promise<void>>();
export const storage = {
  async list(): Promise<WebFretDocument[]> {
    return db.documents.orderBy('updatedAt').reverse().toArray();
  },
  async get(id: string): Promise<WebFretDocument | undefined> {
    await pending.get(id);
    const value = await db.documents.get(id);
    return value ? validateDocument(value) : undefined;
  },
  async save(doc: WebFretDocument): Promise<void> {
    const valid = validateDocument(doc);
    const task = (pending.get(doc.id) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        await db.documents.put(valid);
      });
    pending.set(doc.id, task);
    try {
      await task;
    } finally {
      if (pending.get(doc.id) === task) pending.delete(doc.id);
    }
  },
  async flush(): Promise<void> {
    await Promise.all([...pending.values()]);
  },
  async remove(id: string): Promise<void> {
    await pending.get(id);
    await db.documents.delete(id);
  },
  async restore(docs: WebFretDocument[]): Promise<void> {
    await db.transaction('rw', db.documents, async () => {
      await db.documents.bulkPut(docs.map(validateDocument));
    });
  },
};
