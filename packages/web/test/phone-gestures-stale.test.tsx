// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useGestures } from '../src/phone/useGestures.ts';

function Probe({ log }: { log: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useGestures(ref, { onTransformStart: () => log.push('pinch'), onDragStart: () => log.push('drag') });
  return <div ref={ref} data-testid="s" />;
}
const ev = (type: string, id: number, x: number, y: number) => Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }), { pointerId: id, pointerType: 'touch' });

describe('useGestures stale pointers', () => {
  it('a touch that ended outside the element does not make the next finger a pinch', () => {
    const log: string[] = [];
    const { getByTestId } = render(<Probe log={log} />);
    const el = getByTestId('s');
    el.dispatchEvent(ev('pointerdown', 1, 10, 10));
    window.dispatchEvent(ev('pointerup', 1, 10, 200)); // ended somewhere else, never reached the element
    el.dispatchEvent(ev('pointerdown', 2, 100, 10));
    expect(log).toEqual([]);
    el.dispatchEvent(ev('pointermove', 2, 140, 10));
    expect(log).toEqual(['drag']);
  });
});
