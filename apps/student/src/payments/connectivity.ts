// The device's network state for GateRecovery: when the connection comes back, payment
// availability is read again. A hint only; it never opens payments (only GET /config can).
import type { ConnectivitySource } from '@mensa/domain';
import type { NetworkState } from 'expo-network';

type NetworkModule = Pick<
  typeof import('expo-network'),
  'addNetworkStateListener' | 'getNetworkStateAsync'
>;

/**
 * A connected network that is not known to lack internet access. expo-network 8.0.8 derives
 * `isInternetReachable` from "there is an active network" (Android 10+) or a satisfied path (iOS),
 * not from a probe, so this is no proof that the API can be reached: the read after it decides.
 */
export function isOnline(state: NetworkState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/**
 * Listens to expo-network once for the app's lifetime and shares that listener: on iOS the module
 * cancels its path monitor when its last listener is removed and starts that cancelled monitor
 * again for the next one, which reports nothing. Without the native module (a development build
 * made before it was added) nothing is reported; availability is still read at start-up, in the
 * foreground, after failures and on request.
 */
export function createDeviceConnectivity(load: () => Promise<NetworkModule>): ConnectivitySource {
  const listeners = new Set<(online: boolean) => void>();
  let latest: boolean | null = null;
  let started = false;

  const publish = (online: boolean) => {
    latest = online;
    for (const listener of listeners) listener(online);
  };

  const start = () => {
    if (started) return;
    started = true;
    load().then(
      (network) => {
        network.addNetworkStateListener((state) => publish(isOnline(state)));
        network.getNetworkStateAsync().then(
          (state) => {
            if (latest === null) publish(isOnline(state)); // a change that came first is newer
          },
          () => undefined,
        );
      },
      () => undefined,
    );
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (latest !== null) listener(latest);
      start();
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const deviceConnectivity = createDeviceConnectivity(() => import('expo-network'));
