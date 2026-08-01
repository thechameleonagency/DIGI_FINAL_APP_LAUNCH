import { beforeEach, describe, expect, it } from 'vitest';
import { clearDb } from '../test/fixtures';
import { readFilePayload, storeFile } from './fileService';

describe('fileService (T-1 / F2)', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('rejects disallowed mime types', async () => {
    const res = await readFilePayload(new File(['x'], 'x.exe', { type: 'application/octet-stream' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('FILE_TYPE');
  });

  it('rejects oversized files', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    const res = await readFilePayload(new File([big], 'big.pdf', { type: 'application/pdf' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('FILE_SIZE');
  });

  it('stores allowed deferred payload', async () => {
    const res = await storeFile({
      actor: { id: 'u1' },
      file: {
        name: 'lic.pdf',
        mime: 'application/pdf',
        size: 12,
        dataUrl: 'data:application/pdf;base64,AAAA',
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.name).toBe('lic.pdf');
      expect(res.data.uploadedBy).toBe('u1');
    }
  });
});
