// Self-check of the real SecureStore adapter on this device and build. The student app has an
// identical copy. It writes only a diagnostic record in a scope of its own, never a payment record.
import { useI18n, type I18nValue } from '@mensa/shared/react';
import { useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';
import { checkSecureStorage, type StorageCheck } from '../payments/secure-intent-store';
import { Card } from './ui';

type CheckState =
  { phase: 'idle' } | { phase: 'running' } | { phase: 'done'; result: StorageCheck };

/** Saves, reads back and deletes a test record through the same adapter the payments use. */
export function SecureStorageCheck() {
  const { t } = useI18n();
  const [state, setState] = useState<CheckState>({ phase: 'idle' });
  const running = state.phase === 'running';

  async function run() {
    setState({ phase: 'running' });
    const result = await checkSecureStorage();
    setState({ phase: 'done', result });
    // Android reads the live region below; iOS VoiceOver needs an explicit announcement.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(describeCheck(result, t));
  }

  return (
    <Card title={t('storage.title')}>
      <Text className="text-base text-ink-muted">{t('storage.description')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: running, busy: running }}
        disabled={running}
        onPress={() => void run()}
        className="min-h-touch items-center justify-center rounded-control bg-brand px-4 active:opacity-80"
      >
        <Text className="font-semibold text-brand-on">
          {running ? t('storage.running') : t('storage.run')}
        </Text>
      </Pressable>
      <View accessibilityLiveRegion="polite">
        {state.phase === 'done' ? (
          <Text
            className={`text-base ${state.result.ok ? 'text-ink' : 'font-semibold text-danger'}`}
          >
            {describeCheck(state.result, t)}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function describeCheck(result: StorageCheck, t: I18nValue['t']): string {
  return result.ok
    ? t('storage.ok', { bytes: result.bytes })
    : t('storage.failed', { step: t(`storage.step.${result.step}`) });
}
