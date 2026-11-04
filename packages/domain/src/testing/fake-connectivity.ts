// Test-only. A connectivity source the test drives by hand; it counts its listeners, so a test can
// show that a disposed GateRecovery stopped listening.
import type { ConnectivitySource } from '../gate-recovery';

export class FakeConnectivity implements ConnectivitySource {
  private readonly listeners = new Set<(online: boolean) => void>();

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  report(online: boolean): void {
    for (const listener of this.listeners) listener(online);
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}
