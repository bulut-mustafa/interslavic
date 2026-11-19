import { describe, expect, it } from 'vitest';
import * as H from '../src/editor/history.ts';
import { newLayer } from '../src/editor/layers.ts';
import { emptyProject, type VideoProject } from '../src/video/project.ts';
import { memoryVideoStore, sourceKey, type VideoRecord } from '../src/video/store.ts';

const file = (name: string) => new File(['x'], name, { type: 'video/mp4' });
const project = (...ids: string[]): VideoProject => ({
  ...emptyProject(),
  sources: ids.map((id) => ({ id, kind: 'video' as const, name: `${id}.mp4` })),
  clips: ids.map((id) => ({ id: `c-${id}`, start: 0, end: 5, srcId: id })),
});
const record = (hist: H.History<VideoProject>): VideoRecord => ({ version: 2, hist, lang: 'en', script: 'standard' });

describe('video store v2', () => {
  it('returns nothing when nothing is saved', async () => {
    expect(await memoryVideoStore().load()).toBeNull();
  });

  it('round-trips a record and its source files', async () => {
    const m = memoryVideoStore();
    const hist = H.push(H.start(project('a')), project('a', 'b'));
    await m.saveRecord({ ...record(hist), muted: true, volume: 0.5, voiceOver: true });
    await m.saveSource('a', file('a.mp4'));
    await m.saveSource('b', file('b.mp4'));
    const got = (await m.load())!;
    expect(got.record.hist.present.sources.map((s) => s.id)).toEqual(['a', 'b']);
    expect(got.record.muted).toBe(true);
    expect(got.record.volume).toBe(0.5);
    expect([...got.files.keys()]).toEqual(['a', 'b']);
    expect(got.files.get('b')!.name).toBe('b.mp4');
    expect(got.missing).toEqual([]);
    expect(m.data.has(sourceKey('a'))).toBe(true);
    expect(sourceKey('a')).toBe('video:src:a');
  });

  it('removeSource deletes just that file', async () => {
    const m = memoryVideoStore();
    await m.saveRecord(record(H.start(project('a', 'b'))));
    await m.saveSource('a', file('a.mp4'));
    await m.saveSource('b', file('b.mp4'));
    await m.removeSource('a');
    const got = (await m.load())!;
    expect([...got.files.keys()]).toEqual(['b']);
    expect(got.missing).toEqual(['a']);
  });

  it('lists a source whose file is gone as missing and still returns the whole project', async () => {
    const m = memoryVideoStore();
    const layer = newLayer({ x: 1, y: 1, text: 'keep me' });
    const p = { ...project('a', 'b'), layers: [layer] };
    await m.saveRecord(record(H.start(p)));
    await m.saveSource('a', file('a.mp4'));
    const got = (await m.load())!;
    expect(got.missing).toEqual(['b']);
    expect(got.record.hist.present).toEqual(p);
  });

  it('keeps the file of a source that only an undo step mentions', async () => {
    const m = memoryVideoStore();
    const hist = H.push(H.start(project('a', 'b')), project('a')); // b was removed, but Undo brings it back
    await m.saveRecord(record(hist));
    await m.saveSource('a', file('a.mp4'));
    await m.saveSource('b', file('b.mp4'));
    const got = (await m.load())!;
    expect(got.files.has('b')).toBe(true);
    expect(got.missing).toEqual([]);
  });

  it('clear removes the record and every file, and only the video ones', async () => {
    const m = memoryVideoStore();
    await m.saveRecord(record(H.start(project('a'))));
    await m.saveSource('a', file('a.mp4'));
    m.data.set('photo:meta', 1);
    await m.clear();
    expect(await m.load()).toBeNull();
    expect([...m.data.keys()]).toEqual(['photo:meta']);
  });

  it('passes a write failure (a full disk) on to the caller', async () => {
    const m = memoryVideoStore();
    m.fail.on = true;
    await expect(m.saveSource('a', file('a.mp4'))).rejects.toThrow('QuotaExceededError');
    await expect(m.saveRecord(record(H.start(project('a'))))).rejects.toThrow('QuotaExceededError');
  });
});

describe('reading a version-1 save', () => {
  const v1 = () => {
    const layer = newLayer({ x: 1, y: 2, text: 'Zdravo', start: 1, end: 3 });
    let hist = H.start({ clips: [{ id: 'c', start: 0, end: 60 }], layers: [] as ReturnType<typeof newLayer>[] });
    hist = H.push(hist, { clips: [{ id: 'c', start: 0, end: 30 }], layers: [layer] });
    return { name: 'talk.mp4', hist, lang: 'ru', script: 'cyrillic', muted: true, volume: 0.4 };
  };

  it('comes back as a v2 project: file as source s0, text kept, Undo still works', async () => {
    const m = memoryVideoStore();
    m.data.set('video:record', v1());
    m.data.set('video:file', file('talk.mp4'));
    const got = (await m.load())!;
    expect(got.record.version).toBe(2);
    expect(got.record.lang).toBe('ru');
    expect(got.record.muted).toBe(true);
    expect(got.record.volume).toBe(0.4);
    const now = got.record.hist.present;
    expect(now.sources).toEqual([{ id: 's0', kind: 'video', name: 'talk.mp4' }]);
    expect(now.clips[0]!.srcId).toBe('s0');
    expect(now.layers).toHaveLength(1);
    expect(got.files.get('s0')!.name).toBe('talk.mp4');
    expect(got.missing).toEqual([]);
    const undone = H.undo(got.record.hist);
    expect(undone.present.clips[0]!.end).toBe(60);
    expect(undone.present.layers).toHaveLength(0);
    expect(undone.present.sources).toHaveLength(1);
  });

  it('lists s0 as missing when the old file is gone, and keeps the edit', async () => {
    const m = memoryVideoStore();
    m.data.set('video:record', v1());
    const got = (await m.load())!;
    expect(got.missing).toEqual(['s0']);
    expect(got.files.size).toBe(0);
    expect(got.record.hist.present.layers).toHaveLength(1);
  });

  it('leaves the old keys alone when loading, so reading never loses anything', async () => {
    const m = memoryVideoStore();
    m.data.set('video:record', v1());
    m.data.set('video:file', file('talk.mp4'));
    await m.load();
    expect(m.data.has('video:file')).toBe(true);
    expect((m.data.get('video:record') as { version?: number }).version).toBeUndefined();
  });
});
