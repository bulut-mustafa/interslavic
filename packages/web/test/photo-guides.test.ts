import { describe, expect, it } from 'vitest';
import { snapMove, snapResize } from '../src/photo/guides.ts';
import type { LayerBox } from '../src/video/contracts.ts';

const page = { w: 1000, h: 600 };
const box = (cx: number, cy: number, w = 100, h = 100, rotation = 0, id = 'm'): LayerBox => ({ id, cx, cy, w, h, rotation });

describe('snapMove', () => {
  it('snaps the left edge to the page edge within the threshold', () => {
    const r = snapMove(box(56, 300), [], page, 8, 1);
    expect(r.cx).toBe(50);
    expect(r.dx).toBe(-6);
    expect(r.guides.some((g) => g.axis === 'x' && g.pos === 0 && g.kind === 'page-edge')).toBe(true);
  });
  it('does not snap beyond the threshold, and returns no guides', () => {
    const r = snapMove(box(70, 200), [], page, 8, 1);
    expect(r.cx).toBe(70);
    expect(r.cy).toBe(200);
    expect(r.guides).toEqual([]);
  });
  it('the reach is in screen pixels: zoomed in, it is smaller on the page', () => {
    expect(snapMove(box(56, 200), [], page, 8, 4).cx).toBe(56);
    expect(snapMove(box(56, 200), [], page, 8, 0.5).cx).toBe(50);
  });
  it('snaps the centre to the page centre', () => {
    const r = snapMove(box(503, 297), [], page, 8, 1);
    expect(r.cx).toBe(500);
    expect(r.cy).toBe(300);
    expect(r.guides.filter((g) => g.kind === 'page-center')).toHaveLength(2);
  });
  it('snaps both axes independently', () => {
    const r = snapMove(box(56, 200), [], page, 8, 1);
    expect(r.dx).toBe(-6);
    expect(r.dy).toBe(0);
  });
  it('snaps to another layer and draws the line across both', () => {
    const other = box(700, 100, 100, 50, 0, 'o'); // left 650, right 750, top 75, bottom 125
    const r = snapMove(box(300, 400, 100, 100), [other], page, 8, 1);
    expect(r.cx).toBe(300); // nothing near on x
    const r2 = snapMove(box(603, 400, 100, 100), [other], page, 8, 1); // right edge 653 -> 650? left edge 553.. right 653 vs other.l 650
    expect(r2.dx).toBe(-3);
    const g = r2.guides.find((x) => x.kind === 'layer' && x.axis === 'x')!;
    expect(g.pos).toBe(650);
    expect(g.from).toBe(75);
    expect(g.to).toBe(450);
  });
  it('picks the nearest of several targets', () => {
    const a = box(300, 100, 100, 50, 0, 'a'); // right edge 350
    const r = snapMove(box(405, 400, 100, 100), [a], page, 8, 1); // left edge 355 -> 350 (5), not centre 300
    expect(r.dx).toBe(-5);
  });
  it('on a tie in distance the page beats a layer', () => {
    const o = box(112, 500, 24, 24, 0, 'o'); // left 100, right 124 ; centre 112
    // box left edge at 94: page edge 0 is far; layer left at 100 is 6 away
    expect(snapMove(box(144, 300, 100, 100), [o], page, 8, 1).dx).toBe(6);
    // tie: page edge at distance 4 (left=4) and layer edge at distance 4 (layer left=-... use left 8)
    const o2 = box(14, 500, 12, 12, 0, 'o2'); // left 8
    const r = snapMove(box(54, 300, 100, 100), [o2], page, 8, 1); // left edge 4: page 0 is 4 away, layer left 8 is 4 away
    expect(r.dx).toBe(-4);
    expect(r.guides.some((g) => g.kind === 'page-edge' && g.pos === 0)).toBe(true);
  });
  it('uses the upright extent of a rotated box', () => {
    const r = snapMove(box(80, 300, 100, 20, 90), [], page, 8, 1); // turned: 20 wide, so left edge at 70... centre 80 -> left 70
    expect(r.dx).toBe(0); // left edge 70: nothing within reach
    const r2 = snapMove(box(15, 300, 100, 20, 90), [], page, 8, 1); // left edge 5 -> 0
    expect(r2.dx).toBeCloseTo(-5);
  });
});

describe('snapResize', () => {
  it('snaps the dragged east edge and keeps the west edge', () => {
    const r = snapResize(box(250, 300, 400, 100), 'e', [], page, 8, 1); // edges 50..450
    expect(r.box.cx - r.box.w / 2).toBe(50);
    const r2 = snapResize(box(500, 300, 900, 100), 'e', [], page, 8, 1); // 50..950: right 950, page right 1000 is 50 away
    expect(r2.box.w).toBe(900);
    const r3 = snapResize(box(500, 300, 940, 100), 'e', [], page, 8, 1); // 30..970 no; still 30 away
    expect(r3.box.w).toBe(940);
    const r4 = snapResize(box(500, 300, 990, 100), 'e', [], page, 8, 1); // 5..995 -> 1000
    expect(r4.box.w).toBe(995);
    expect(r4.box.cx - r4.box.w / 2).toBeCloseTo(5);
    expect(r4.guides[0]).toMatchObject({ axis: 'x', pos: 1000 });
  });
  it('snaps a corner on both axes', () => {
    const r = snapResize(box(300, 200, 590, 390), 'se', [], page, 8, 1); // l 5, r 595, t 5, b 395 -> r none? page centre 500 no; keep checks on top-left fixed
    expect(r.box.cx - r.box.w / 2).toBeCloseTo(5);
    const r2 = snapResize(box(250, 100, 395, 100), 'se', [], page, 8, 1); // r 447.5.. just check no change when none near
    expect(r2.guides).toEqual([]);
    const r3 = snapResize(box(255, 305, 505, 595), 'se', [], page, 8, 1); // l 2.5 r 507.5 (centre 500 is 7.5 away) t 7.5 b 602.5 (page 600)
    expect(r3.box.cx + r3.box.w / 2).toBeCloseTo(500);
    expect(r3.box.cy + r3.box.h / 2).toBeCloseTo(600);
  });
  it('snaps the west edge to another layer', () => {
    const o = box(100, 100, 100, 100, 0, 'o'); // right edge 150
    const r = snapResize(box(300, 500, 300, 100), 'w', [o], page, 8, 1); // left 150 exactly
    expect(r.guides.some((g) => g.kind === 'layer')).toBe(true);
    const r2 = snapResize(box(300, 500, 296, 100), 'w', [o], page, 8, 1); // left 152 -> 150, right 448 stays
    expect(r2.box.w).toBe(298);
  });
  it('leaves turned boxes alone', () => {
    const b = box(10, 10, 100, 100, 30);
    expect(snapResize(b, 'e', [], page, 8, 1)).toEqual({ box: b, guides: [] });
  });
});
