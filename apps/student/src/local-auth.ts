// The native authentication adapter: Expo LocalAuthentication 17 (SDK 54) mapped to the domain's
// LocalAuthResult. Behaviour checked in the installed module's source, not assumed:
// - Android: a BiometricPrompt that allows BIOMETRIC_WEAK | DEVICE_CREDENTIAL, so a fingerprint
//   prompt with the system's "use PIN" option. On Android 10 (API 29) that combination is supported;
//   STRONG | DEVICE_CREDENTIAL is not before API 30, so the security level stays at the default.
//   If biometrics are unavailable, Android 10 falls back to the Keyguard PIN screen.
// - iOS: Face ID or Touch ID with the device passcode as fallback (LAPolicyDeviceOwnerAuthentication).
//   Face ID needs NSFaceIDUsageDescription, so it works in a development build, not in Expo Go.
// - No screen lock at all: `not_enrolled` before any prompt; the app then explains how to set one up.
import type { LocalAuthResult } from '@mensa/domain';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Asks the device owner to confirm with fingerprint, face or the device PIN. Never succeeds by
 * itself: a cancelled, failed or unavailable prompt is a refusal, and the caller sends nothing.
 */
export async function authenticateLocally(text: {
  prompt: string;
  cancel: string;
}): Promise<LocalAuthResult> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      return { ok: false, reason: 'not_enrolled' };
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: text.prompt,
      cancelLabel: text.cancel,
      disableDeviceFallback: false,
    });
    if (result.success) return { ok: true };
    switch (result.error) {
      case 'user_cancel':
      case 'system_cancel':
      case 'app_cancel':
        return { ok: false, reason: 'cancelled' };
      case 'not_enrolled':
      case 'passcode_not_set':
        return { ok: false, reason: 'not_enrolled' };
      case 'lockout':
        return { ok: false, reason: 'locked_out' };
      case 'not_available':
        return { ok: false, reason: 'unavailable' };
      default:
        return { ok: false, reason: 'failed' };
    }
  } catch {
    // No activity, or an internal error in the native module: treat as a failed prompt.
    return { ok: false, reason: 'failed' };
  }
}
