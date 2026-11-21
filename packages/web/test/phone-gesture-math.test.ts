import { describe, expect, it } from 'vitest';
import { angleDeg, angleDelta, distance, isDoubleTap, midpoint, movedBeyond, pinchScale } from '../src/phone/gestureMath.ts';

describe('gesture math', () => {
  it('distance and midpoint', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpoint({ x: 0, y: 10 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 15 });
  });
  it('angles are in degrees, clockwise positive on screen', () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(90);
    expect(angleDeg({ x: 0, y: 0 }, { x: -1, y: 0 })).toBe(180);
  });
  it('angleDelta takes the short way round the seam', () => {
    expect(angleDelta(170, -170)).toBe(20);
    expect(angleDelta(-170, 170)).toBe(-20);
    expect(angleDelta(10, 40)).toBe(30);
    expect(angleDelta(0, 180)).toBe(180);
  });
  it('pinchScale is a ratio and tolerates a zero start', () => {
    expect(pinchScale(100, 150)).toBe(1.5);
    expect(pinchScale(0, 50)).toBe(1);
  });
  it('movedBeyond is strict', () => {
    expect(movedBeyond({ x: 0, y: 0 }, { x: 6, y: 8 }, 10)).toBe(false);
    expect(movedBeyond({ x: 0, y: 0 }, { x: 6, y: 8.1 }, 10)).toBe(true);
  });
  it('double tap needs both time and place', () => {
    const a = { x: 0, y: 0 };
    expect(isDoubleTap(a, 0, { x: 10, y: 0 }, 250)).toBe(true);
    expect(isDoubleTap(a, 0, { x: 10, y: 0 }, 350)).toBe(false);
    expect(isDoubleTap(a, 0, { x: 50, y: 0 }, 100)).toBe(false);
  });
});
