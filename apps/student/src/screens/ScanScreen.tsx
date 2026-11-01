import { parseOrderCode, parseOrderQr, ScanLock, type QrParseResult } from '@mensa/domain';
import { useI18n } from '@mensa/shared/react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';
import { Card } from '../components/Foundation';
import { Body, Button, Notice, Screen, useAnnouncement, useAppActive } from '../components/ui';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;
type Problem = Exclude<QrParseResult, { ok: true }>['reason'] | 'camera';

/**
 * Scans a till's QR code. The code names an order, nothing else: it is parsed into an order ID
 * and the order is loaded from our own API on the next screen. A scanned link is never opened and
 * nothing in the code is trusted as an amount.
 */
export function ScanScreen({ navigation }: Props) {
  const { t } = useI18n();
  const [permission, requestPermission, readPermission] = useCameraPermissions();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const lock = useRef(new ScanLock()).current;
  const [problem, setProblem] = useState<Problem | null>(null);
  const [typed, setTyped] = useState('');
  const [typedInvalid, setTypedInvalid] = useState(false);

  // Returning from the system settings changes the permission without telling the app: read it again.
  useEffect(() => {
    if (appActive) void readPermission();
  }, [appActive, readPermission]);

  // Coming back to this screen starts a fresh scan: the lock is released deliberately, here only.
  useFocusEffect(
    useCallback(() => {
      lock.release();
      setProblem(null);
    }, [lock]),
  );

  const onScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      // Taken synchronously: the camera repeats the same code many times per second.
      if (!lock.tryAcquire()) return;
      const parsed = parseOrderQr(data);
      if (parsed.ok) navigation.navigate('Review', { orderId: parsed.orderId });
      else setProblem(parsed.reason); // stays locked until "Scan again"
    },
    [lock, navigation],
  );

  function scanAgain() {
    setProblem(null);
    lock.release();
  }

  function openTyped() {
    const parsed = parseOrderCode(typed);
    setTypedInvalid(!parsed.ok);
    if (parsed.ok && lock.tryAcquire()) navigation.navigate('Review', { orderId: parsed.orderId });
  }

  // The camera runs only while this screen is visible, the app is in front and no error is shown;
  // it is never left running behind the review or the payment prompt.
  const cameraOn = focused && appActive && permission?.granted === true && problem === null;
  useAnnouncement(cameraOn ? t('scan.cameraOn') : null);

  return (
    <Screen>
      <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
        {t('scan.title')}
      </Text>

      {permission === null ? (
        <Notice tone="neutral" title={t('scan.permissionChecking')} />
      ) : !permission.granted && permission.canAskAgain ? (
        <Notice tone="neutral" title={t('scan.permissionTitle')}>
          <Body>{t('scan.permissionBody')}</Body>
          <Button label={t('scan.allow')} onPress={() => void requestPermission()} />
        </Notice>
      ) : !permission.granted ? (
        <Notice tone="warning" title={t('scan.deniedTitle')}>
          <Body>{t('scan.deniedBody')}</Body>
          <Button label={t('scan.openSettings')} onPress={() => void Linking.openSettings()} />
        </Notice>
      ) : null}

      {cameraOn ? (
        <View
          accessible
          accessibilityLabel={t('scan.cameraLabel')}
          className="overflow-hidden rounded-card bg-ink"
        >
          <CameraView
            style={{ width: '100%', aspectRatio: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onScanned}
            onMountError={() => setProblem('camera')}
          />
        </View>
      ) : null}
      {permission?.granted ? <Body muted>{t('scan.instructions')}</Body> : null}

      {problem ? (
        <Notice tone="error" title={t(`scan.problem.${problem}`)}>
          <Button label={t('scan.again')} onPress={scanAgain} />
        </Notice>
      ) : null}

      <Card title={t('scan.typeTitle')}>
        <Body muted>{t('scan.typeHint')}</Body>
        <TextInput
          value={typed}
          onChangeText={(text) => {
            setTyped(text);
            setTypedInvalid(false);
          }}
          onSubmitEditing={openTyped}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          accessibilityLabel={t('scan.typeLabel')}
          placeholder="ord_…"
          className="min-h-touch rounded-control border-2 border-line bg-surface px-3 text-base text-ink"
        />
        {typedInvalid ? (
          <Text accessibilityLiveRegion="polite" className="text-base font-semibold text-danger">
            {t('scan.problem.invalid_order_id')}
          </Text>
        ) : null}
        <Button
          tone="secondary"
          label={t('scan.typeOpen')}
          disabled={typed.trim() === ''}
          onPress={openTyped}
        />
      </Card>
    </Screen>
  );
}
