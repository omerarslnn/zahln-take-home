import { parseOrderCode, parseOrderQr, ScanLock, type QrParseResult } from '@mensa/domain';
import { colors } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Viewfinder } from '../components/Viewfinder';
import {
  Body,
  Button,
  Card,
  EmptyState,
  Icon,
  LoadingIndicator,
  Notice,
  Screen,
  TextField,
  useAnnouncement,
  useAppActive,
} from '../components/ui';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;
type Problem = Exclude<QrParseResult, { ok: true }>['reason'] | 'camera';

/**
 * Scans a till's QR code. The code names an order, nothing else: it is parsed into an order ID
 * and the order is loaded from our own API on the next screen. A scanned link is never opened and
 * nothing in the code is trusted as an amount. Layout: the viewfinder (or the camera-permission
 * step), one line of instruction or the problem with "Scan again", and typing the code as the
 * fallback that always works, also with a screen reader.
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
  useAnnouncement(problem ? t(`scan.problem.${problem}`) : null);
  useAnnouncement(typedInvalid ? t('scan.problem.invalid_order_id') : null);

  return (
    <Screen>
      {permission === null ? <LoadingIndicator label={t('scan.permissionChecking')} /> : null}
      {permission && !permission.granted ? (
        <Card>
          {permission.canAskAgain ? (
            <EmptyState
              icon="camera-outline"
              title={t('scan.permissionTitle')}
              description={t('scan.permissionBody')}
              action={<Button label={t('scan.allow')} onPress={() => void requestPermission()} />}
            />
          ) : (
            <EmptyState
              icon="videocam-off-outline"
              title={t('scan.deniedTitle')}
              description={t('scan.deniedBody')}
              action={
                <Button
                  tone="secondary"
                  label={t('scan.openSettings')}
                  onPress={() => void Linking.openSettings()}
                />
              }
            />
          )}
        </Card>
      ) : null}

      {permission?.granted ? (
        <Viewfinder
          label={t('scan.cameraLabel')}
          camera={
            cameraOn ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={onScanned}
                onMountError={() => setProblem('camera')}
              />
            ) : null
          }
        />
      ) : null}

      {problem ? (
        <Notice
          tone="error"
          title={t(`scan.problem.${problem}`)}
          actions={<Button label={t('scan.again')} onPress={scanAgain} />}
        />
      ) : permission?.granted ? (
        <View className="flex-row gap-3 px-1">
          <View className="h-6 justify-center">
            <Icon name="scan-outline" color={colors.inkMuted} />
          </View>
          <View className="flex-1">
            <Body muted>{t('scan.instructions')}</Body>
          </View>
        </View>
      ) : null}

      <Card title={t('scan.typeTitle')}>
        <TextField
          label={t('scan.typeLabel')}
          hint={t('scan.typeHint')}
          value={typed}
          onChangeText={(text) => {
            setTyped(text);
            setTypedInvalid(false);
          }}
          error={typedInvalid ? t('scan.problem.invalid_order_id') : null}
          onSubmitEditing={openTyped}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="go"
          placeholder="ord_…"
        />
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
