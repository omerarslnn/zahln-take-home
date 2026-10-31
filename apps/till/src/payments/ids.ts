import { randomUUID } from 'expo-crypto';

/** Idempotency keys come from the platform's cryptographically secure random source (UUID v4). */
export const newIntentKey = (): string => randomUUID();
