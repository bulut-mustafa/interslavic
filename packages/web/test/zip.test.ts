import { describe, expect, it } from 'vitest';
import { crc32, uniqueNames, zipBytes } from '../src/zip.ts';

const enc = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(enc('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('uniqueNames', () => {
  it('numbers repeats before the extension and leaves the rest alone', () => {
    expect(uniqueNames(['a.png', 'b.png', 'a.png', 'a.png', 'c'])).toEqual(['a.png', 'b.png', 'a-2.png', 'a-3.png', 'c']);
  });
});

describe('zipBytes', () => {
  const zip = zipBytes([{ name: 'one.png', data: enc('first') }, { name: 'two.png', data: enc('second!') }], new Date(2026, 10, 8, 20, 30, 40));
  const dv = new DataView(zip.buffer);

  it('ends with a directory that counts the files and says where it starts', () => {
    const end = zip.length - 22;
    expect(dv.getUint32(end, true)).toBe(0x06054b50);
    expect(dv.getUint16(end + 10, true)).toBe(2);
    const cdAt = dv.getUint32(end + 16, true);
    expect(dv.getUint32(cdAt, true)).toBe(0x02014b50);
  });

  it('stores each file whole, after a header that names it and checks it', () => {
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    const nameLen = dv.getUint16(26, true);
    expect(new TextDecoder().decode(zip.slice(30, 30 + nameLen))).toBe('one.png');
    expect(dv.getUint32(14, true)).toBe(crc32(enc('first')));
    expect(dv.getUint32(18, true)).toBe(5);
    expect(new TextDecoder().decode(zip.slice(30 + nameLen, 30 + nameLen + 5))).toBe('first');
  });

  it('points each directory entry at its file', () => {
    const end = zip.length - 22;
    let at = dv.getUint32(end + 16, true);
    const offsets: number[] = [];
    for (let i = 0; i < 2; i++) {
      offsets.push(dv.getUint32(at + 42, true));
      at += 46 + dv.getUint16(at + 28, true);
    }
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBe(30 + 'one.png'.length + 5);
    expect(dv.getUint32(offsets[1]!, true)).toBe(0x04034b50);
  });
});
