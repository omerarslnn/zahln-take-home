// An order's countdown, as pure functions (the student's review, the till's QR). The till has an
// identical copy. The seconds come from the order's `expiresAt` and the server clock (never the
// device clock); this only formats them.

/** Under this many seconds left the countdown is shown as a warning. */
export const COUNTDOWN_WARNING_S = 60;

/** "4:05", "0:09". */
export function countdownText(secondsLeft: number): string {
  const seconds = Math.max(0, Math.floor(secondsLeft));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The tone of the countdown: calm, then a warning in the last minute. */
export function countdownTone(secondsLeft: number): 'neutral' | 'warning' {
  return secondsLeft < COUNTDOWN_WARNING_S ? 'warning' : 'neutral';
}
