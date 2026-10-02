import { blake3Hex, loadTestHasher, makeFile } from '../testing/fake-storage';
import { createBlake3Hasher } from './blake3';
import { FileHashing } from './file-hashing';

beforeAll(() => loadTestHasher());

const hashOf = async (file: Blob) => blake3Hex(new Uint8Array(await file.arrayBuffer()));

describe('BLAKE3 wasm', () => {
  it('matches the reference vectors', () => {
    expect(blake3Hex(new Uint8Array())).toBe('af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262');
    expect(blake3Hex(new TextEncoder().encode('abc'))).toBe(
      '6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85',
    );
  });
});

describe('FileHashing', () => {
  it('hashes slice by slice to the same hash as at once', async () => {
    const file = makeFile(10_000);
    const progress: number[] = [];

    const hash = await new FileHashing(file, createBlake3Hasher, 3_000).run(new AbortController().signal, (n) =>
      progress.push(n),
    );

    expect(hash).toBe(await hashOf(file));
    expect(progress).toEqual([3_000, 6_000, 9_000, 10_000]);
  });

  it('continues where it stopped after an abort', async () => {
    const file = makeFile(10_000);
    const hashing = new FileHashing(file, createBlake3Hasher, 3_000);
    const controller = new AbortController();

    await expect(
      hashing.run(controller.signal, (n) => {
        if (n === 6_000) controller.abort();
      }),
    ).rejects.toThrow(expect.objectContaining({ name: 'AbortError' }));
    expect(hashing.hashedBytes).toBe(6_000);

    const progress: number[] = [];
    const hash = await hashing.run(new AbortController().signal, (n) => progress.push(n));

    expect(progress).toEqual([9_000, 10_000]);
    expect(hash).toBe(await hashOf(file));
  });

  it('starts over after dispose', async () => {
    const file = makeFile(5_000);
    const hashing = new FileHashing(file, createBlake3Hasher, 2_000);
    const controller = new AbortController();
    await hashing.run(controller.signal, () => controller.abort()).catch(() => undefined);

    hashing.dispose();

    expect(hashing.hashedBytes).toBe(0);
    expect(await hashing.run(new AbortController().signal, () => undefined)).toBe(await hashOf(file));
  });

  it('hashes an empty file', async () => {
    const hash = await new FileHashing(makeFile(0), createBlake3Hasher).run(new AbortController().signal, () => undefined);
    expect(hash).toBe('af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262');
  });
});
