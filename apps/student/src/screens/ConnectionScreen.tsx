import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionCheck } from '../components/ConnectionCheck';

export function ConnectionScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="px-4 pt-4"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
    >
      <ConnectionCheck />
    </ScrollView>
  );
}
