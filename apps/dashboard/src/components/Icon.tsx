// A handful of line icons drawn inline (24 × 24, stroke = currentColor), so the dashboard needs no
// icon library. Every icon is decorative: the words next to it carry the meaning.
const PATHS = {
  report: 'M4 20V10 M10 20V4 M16 20v-7 M3 20h18',
  attention: 'M12 3 2 20h20L12 3z M12 9.5v4.5 M12 17v.5',
  payments: 'M9 6h12 M9 12h12 M9 18h12 M4 6h.5 M4 12h.5 M4 18h.5',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 20h16',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4 M10 17l5-5-5-5 M15 12H3',
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66L20 8.5 M20 3.5v5h-5',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  arrowLeft: 'M19 12H5 M11 6l-6 6 6 6',
  gross: 'M17.5 7.5A6.5 6.5 0 1 0 17.5 16.5 M4.5 10.5h8 M4.5 13.5h8',
  refund: 'M9 14 4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  net: 'M5 9h14 M5 15h14',
  pending: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  check: 'M5 12l5 5L20 7',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v6 M12 7.5v.5',
  brand: 'M3 21h18 M5 21V9l7-5 7 5v12 M9.5 21v-5.5h5V21',
  filter: 'M4 5h16l-6 7.5V19l-4-2v-4.5L4 5z',
  close: 'M6 6l12 12 M18 6 6 18',
  file: 'M14 3H6v18h12V7l-4-4z M14 3v4h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
