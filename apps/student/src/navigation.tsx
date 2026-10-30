import { useI18n } from '@mensa/shared/react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ConnectionScreen } from './screens/ConnectionScreen';
import { HomeScreen } from './screens/HomeScreen';

/** Every screen and its route parameters. Stage 2 adds Scan, Confirm, Result, History and Detail. */
export type RootStackParamList = {
  Home: undefined;
  Connection: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** A native stack: platform push/pop transitions and back handling, like a navigation controller. */
export function RootNavigator() {
  const { t } = useI18n();
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: t('student.nav.home') }} />
      <Stack.Screen
        name="Connection"
        component={ConnectionScreen}
        options={{ title: t('student.nav.connection') }}
      />
    </Stack.Navigator>
  );
}
