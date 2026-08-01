import type { StoredFile, User } from '../domain/entities/types';
import { fail, ok, type Result } from '../domain/errors/types';
import { newId } from '../domain/utils/ids';
import { db } from '../data/db';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']);

function normalizeMime(mime: string): string {
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

export type FileActor = Pick<User, 'id'> | User;

/** Validate type/size and optionally read a File to a deferred payload (pre-auth registration). */
export async function readFilePayload(
  file: File,
): Promise<Result<{ name: string; mime: string; size: number; dataUrl: string }>> {
  const mime = normalizeMime(file.type);
  if (!ALLOWED.has(mime) && !ALLOWED.has(file.type)) {
    return fail('Validation', 'FILE_TYPE', 'Only PDF, JPG, and PNG files are allowed.', 'File was not stored.');
  }
  if (file.size > MAX_BYTES) {
    return fail('Validation', 'FILE_SIZE', 'File must be 5 MB or smaller.', 'File was not stored.');
  }
  const dataUrl = await readAsDataUrl(file);
  return ok({ name: file.name, mime, size: file.size, dataUrl });
}

export async function storeFile(params: {
  actor: FileActor;
  file: File | { name: string; mime: string; size: number; dataUrl: string };
}): Promise<Result<StoredFile>> {
  const mime = normalizeMime(params.file instanceof File ? params.file.type : params.file.mime);
  const size = params.file instanceof File ? params.file.size : params.file.size;
  const name = params.file instanceof File ? params.file.name : params.file.name;

  if (!ALLOWED.has(mime) && !ALLOWED.has(params.file instanceof File ? params.file.type : params.file.mime)) {
    return fail('Validation', 'FILE_TYPE', 'Only PDF, JPG, and PNG files are allowed.', 'File was not stored.');
  }
  if (size > MAX_BYTES) {
    return fail('Validation', 'FILE_SIZE', 'File must be 5 MB or smaller.', 'File was not stored.');
  }

  let dataUrl: string;
  if (params.file instanceof File) {
    dataUrl = await readAsDataUrl(params.file);
  } else {
    dataUrl = params.file.dataUrl;
  }

  const stored: StoredFile = {
    id: newId(),
    name,
    mime,
    size,
    dataUrl,
    uploadedBy: params.actor.id,
    createdAt: new Date().toISOString(),
  };
  await db.files.put(stored);
  return ok(stored);
}

export async function getFile(fileId: string): Promise<StoredFile | undefined> {
  return db.files.get(fileId);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
