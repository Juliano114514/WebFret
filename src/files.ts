import {
  copyDocument,
  defaultPractice,
  validateDocument,
  type ImportedGpScore,
  type WebFretDocument,
} from './model';

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_GP_BYTES = 10 * 1024 * 1024;
export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
export function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
export function download(name: string, data: BlobPart, mime = 'application/json'): void {
  const safeName = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 160);
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName || 'WebFret';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function exportDocument(doc: WebFretDocument): void {
  download(doc.title + '.webfret.json', JSON.stringify(validateDocument(doc), null, 2));
}
export function exportBackup(docs: WebFretDocument[]): number {
  const encoder = new TextEncoder();
  const batches: string[][] = [];
  let batch: string[] = [];
  let size = 100;
  for (const doc of docs) {
    const json = JSON.stringify(validateDocument(doc));
    const bytes = encoder.encode(json).length + 1;
    if (batch.length && (size + bytes > MAX_DOCUMENT_BYTES - 1024 || batch.length >= 200)) {
      batches.push(batch);
      batch = [];
      size = 100;
    }
    if (bytes > MAX_DOCUMENT_BYTES - 1024) throw new Error('单首曲目超过备份文件大小限制');
    batch.push(json);
    size += bytes;
  }
  if (batch.length) batches.push(batch);
  batches.forEach((items, i) =>
    download(
      `WebFret-备份-${new Date().toISOString().slice(0, 10)}${batches.length > 1 ? `-${i + 1}of${batches.length}` : ''}.json`,
      `{"format":"webfret-backup","version":1,"documents":[${items.join(',')}]}`,
    ),
  );
  return batches.length;
}
export async function inspectGp(
  bytes: Uint8Array,
): Promise<
  Omit<ImportedGpScore, 'kind' | 'originalName' | 'base64'> & { title: string; artist: string }
> {
  if (bytes.length > MAX_GP_BYTES) throw new Error('GP 文件不能超过 10 MB');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
    const end = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    const timeout = setTimeout(() => {
      end();
      reject(new Error('曲目解析超时，请检查文件或使用较小的曲目'));
    }, 15000);
    worker.onerror = () => {
      end();
      reject(new Error('GP 解析失败，文件可能损坏或超出资源限制'));
    };
    worker.onmessage = (event) => {
      if (event.data?.type !== 'webfret-gp-result') return;
      end();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    const buffer = bytes.slice().buffer;
    worker.postMessage({ cmd: 'webfret.parse-gp', bytes: buffer }, [buffer]);
  });
}
export async function documentFromGp(bytes: Uint8Array, name: string): Promise<WebFretDocument> {
  const metadata = await inspectGp(bytes);
  const now = new Date().toISOString();
  return validateDocument({
    format: 'webfret',
    version: 1,
    id: crypto.randomUUID(),
    title: metadata.title || name.replace(/\.[^.]+$/, ''),
    artist: metadata.artist || '',
    createdAt: now,
    updatedAt: now,
    score: { kind: 'guitar-pro', originalName: name, base64: bytesToBase64(bytes), ...metadata },
    practice: defaultPractice(metadata.measureCount),
  });
}
export async function importFile(file: File, backup = false): Promise<WebFretDocument[]> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('文件不能超过 20 MB；完整备份请分批导入');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.(gp[345]?|gpx)$/i.test(file.name)) return [await documentFromGp(bytes, file.name)];
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('不是有效的 WebFret JSON 或 Guitar Pro 文件');
  }
  if (backup) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('format' in raw) ||
      raw.format !== 'webfret-backup' ||
      !('version' in raw) ||
      raw.version !== 1 ||
      !('documents' in raw) ||
      !Array.isArray(raw.documents) ||
      raw.documents.length > 200
    )
      throw new Error('不是支持的 WebFret 备份，或超过 200 首曲目');
    const docs = raw.documents.map(validateDocument);
    if (new Set(docs.map((d) => d.id)).size !== docs.length) throw new Error('备份包含重复曲目 ID');
    // Fully inspect all GP payloads before committing the restore transaction.
    for (const doc of docs) if (doc.score.kind === 'guitar-pro') await verifyGpDocument(doc);
    return docs;
  }
  const doc = copyDocument(validateDocument(raw));
  if (doc.score.kind === 'guitar-pro') await verifyGpDocument(doc);
  return [doc];
}
async function verifyGpDocument(doc: WebFretDocument): Promise<void> {
  if (doc.score.kind !== 'guitar-pro') return;
  const actual = await inspectGp(base64ToBytes(doc.score.base64));
  doc.score.measureCount = actual.measureCount;
  doc.score.trackCount = actual.trackCount;
  doc.score.tempo = actual.tempo;
  validateDocument(doc);
}
