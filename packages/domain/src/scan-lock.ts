/**
 * A one-shot lock for a scanner callback. A camera reports the same QR code many times per second,
 * and React state updates too late to stop the next callback; this flag is taken synchronously by
 * the first callback, before any async work, so one scan loads one order. The screen releases it
 * deliberately, when the user returns to scanning.
 */
export class ScanLock {
  private locked = false;

  /** True for the first caller only, until `release`. */
  tryAcquire(): boolean {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  release(): void {
    this.locked = false;
  }

  get isLocked(): boolean {
    return this.locked;
  }
}
