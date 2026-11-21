/** Paths on the 24x24 grid for the strip's icons that components/Icon.tsx does not have (drawn with photo/path-icon.tsx). */
export const ICONS = {
  background: 'M12 4a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4',
  crop: 'M7 3v14h14M3 7h14v14',
  adjust: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  font: 'M4 20L11 4l7 16M7 14h8M20 8h.01',
  size: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  colour: 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z',
  effects: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  position: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  frame: 'M4 4h16v16H4zM8 8h8v8H8z',
  pages: 'M8 3h11v14H8zM5 7v14h11',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
} as const;
