import type { NetworkState } from 'expo-network';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDeviceConnectivity, isOnline } from './connectivity';

const ONLINE: NetworkState = { isConnected: true, isInternetReachable: true };
const OFFLINE: NetworkState = { isConnected: false, isInternetReachable: false };

/** expo-network as the app sees it: native listeners and a current-state reading. */
function fakeNetwork() {
  const listeners: ((state: NetworkState) => void)[] = [];
  let answerReading: (state: NetworkState) => void = () => undefined;
  return {
    module: {
      addNetworkStateListener(listener: (state: NetworkState) => void) {
        listeners.push(listener);
        return { remove: () => void listeners.splice(listeners.indexOf(listener), 1) };
      },
      getNetworkStateAsync: () => new Promise<NetworkState>((resolve) => (answerReading = resolve)),
    },
    change: (state: NetworkState) => listeners.forEach((listener) => listener(state)),
    answerReading: (state: NetworkState) => answerReading(state),
    nativeListeners: () => listeners.length,
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('device connectivity for payment availability', () => {
  it('shares one native listener for the app lifetime; unsubscribing removes only its own', async () => {
    const network = fakeNetwork();
    const connectivity = createDeviceConnectivity(() => Promise.resolve(network.module));
    const first: boolean[] = [];
    const second: boolean[] = [];
    const stopFirst = connectivity.subscribe((online) => first.push(online));
    const stopSecond = connectivity.subscribe((online) => second.push(online));
    await settle();
    assert.equal(network.nativeListeners(), 1);

    network.change(OFFLINE);
    stopFirst();
    network.change(ONLINE);
    assert.deepEqual(first, [false]);
    assert.deepEqual(second, [false, true]);

    stopSecond();
    assert.equal(
      network.nativeListeners(),
      1,
      'kept: on iOS the module cannot restart its monitor',
    );
    const third: boolean[] = [];
    connectivity.subscribe((online) => third.push(online));
    await settle();
    assert.deepEqual(third, [true], 'a new listener hears the current state at once');
    assert.equal(network.nativeListeners(), 1);
  });

  it('uses the current-state reading only when no change arrived before it', async () => {
    const late = fakeNetwork();
    const seenLate: boolean[] = [];
    createDeviceConnectivity(() => Promise.resolve(late.module)).subscribe((online) =>
      seenLate.push(online),
    );
    await settle();
    late.change(ONLINE);
    late.answerReading(OFFLINE); // taken before the change, delivered after it
    await settle();
    assert.deepEqual(seenLate, [true]);

    const first = fakeNetwork();
    const seenFirst: boolean[] = [];
    createDeviceConnectivity(() => Promise.resolve(first.module)).subscribe((online) =>
      seenFirst.push(online),
    );
    await settle();
    first.answerReading(OFFLINE);
    await settle();
    assert.deepEqual(seenFirst, [false]);
  });

  it('reports nothing, and does not throw, in a build without the native module', async () => {
    const connectivity = createDeviceConnectivity(() =>
      Promise.reject(new Error("Cannot find native module 'ExpoNetwork'")),
    );
    const seen: boolean[] = [];
    const stop = connectivity.subscribe((online) => seen.push(online));
    await settle();
    stop();
    assert.deepEqual(seen, []);
  });

  it('online means a connected network that is not known to lack internet access', () => {
    assert.equal(isOnline(OFFLINE), false); // airplane mode
    assert.equal(isOnline(ONLINE), true);
    assert.equal(isOnline({ isConnected: true, isInternetReachable: false }), false);
    assert.equal(isOnline({ isConnected: true }), true);
    assert.equal(isOnline({}), false);
  });
});
