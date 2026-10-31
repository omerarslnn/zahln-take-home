import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionCheck } from '../components/ConnectionCheck';
import { SecureStorageCheck } from '../components/SecureStorageCheck';

export function ConnectionScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-4 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
    >
      <ConnectionCheck />
      <SecureStorageCheck />
    </ScrollView>
  );
}
