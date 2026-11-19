/** Small line icons, all drawn on a 24x24 grid, for buttons that have no room for words. */
const PATHS = {
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  addText: 'M3 6V4h12v2M9 4v13M7 17h4M18 13v7M14.5 16.5h7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  bold: 'M7 4h6a4 4 0 010 8H7zM7 12h7a4 4 0 010 8H7z',
  italic: 'M10 4h8M6 20h8M14 4L10 20',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  translate: 'M4 5h9M8 3v2M6 5c0 4 3 7 6 8M12 5c-1 4-4 7-8 9M13 20l4-9 4 9M14.5 17h5',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  front: 'M8 8h12v12H8zM4 4h12v3M4 4v12h3',
  save: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  split: 'M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM8.1 7.9L20 20M8.1 16.1L20 4',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  subtitles: 'M3 5h18v14H3zM7 12h4M13 12h4M7 15h7',
  volumeOn: 'M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 010 7M18.5 6a9 9 0 010 12',
  volumeOff: 'M11 5L6 9H3v6h3l5 4zM16 9l5 6M21 9l-5 6',
  fileText: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7',
  print: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z',
  check: 'M5 12l5 5 9-10',
  mic: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5a.5.5 0 110-1 .5.5 0 010 1z',
  rotate: 'M20 12a8 8 0 11-2.6-5.9M20 4v5h-5',
  opacity: 'M12 3.5C9 7 6 10 6 14a6 6 0 0012 0c0-4-3-7-6-10.5zM12 20V8',
  toBack: 'M4 4h12v12H4zM10 10h10v10H10z',
  forward: 'M12 20V5M6 11l6-6 6 6M5 20h14',
  backward: 'M12 4v15M6 13l6 6 6-6M5 4h14',
  swap: 'M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = '1.1rem' }: { name: IconName; size?: string }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
