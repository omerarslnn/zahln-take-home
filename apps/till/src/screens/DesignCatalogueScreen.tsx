// Development only: every design-system primitive in its states, for design review and visual
// checks (docs/design-system.md). Registered only when __DEV__, so release bundles do not contain
// it. Its sample texts are English on purpose: it is a tool, not a product screen.
import { colors, type ColorToken } from '@mensa/shared';
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  AmountText,
  Body,
  Button,
  Caption,
  Card,
  EmptyState,
  Heading,
  IconButton,
  LabelledValue,
  ListRow,
  LoadingIndicator,
  Notice,
  PasswordField,
  Screen,
  Section,
  Skeleton,
  StatusPill,
  Tag,
  TextField,
  Title,
  type Tone,
} from '../components/ui';

const TONES: Tone[] = ['ok', 'pending', 'warning', 'error', 'neutral'];
const SWATCHES: ColorToken[] = [
  'brand',
  'brandStrong',
  'brandSubtle',
  'ink',
  'inkMuted',
  'canvas',
  'fill',
  'line',
  'lineSubtle',
  'success',
  'successSubtle',
  'warning',
  'warningSubtle',
  'danger',
  'dangerSubtle',
];

export function DesignCatalogueScreen() {
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('1,234');
  const [pin, setPin] = useState('');
  const decimals = amount.split(',')[1] ?? '';
  return (
    <Screen
      footer={<Button label="Pay €4.20" hint="The bottom action bar" onPress={() => undefined} />}
    >
      <Title>Design system</Title>
      <Caption>Tokens and primitives in their states. Development builds only.</Caption>

      <Section title="Type" description="System fonts: SF Pro on iOS, Roboto on Android.">
        <Card>
          <Title>Title 28</Title>
          <Heading>Headline 18</Heading>
          <Body>Body 16: the default text, wrapping freely at every text size.</Body>
          <Body muted>Body 16 muted: secondary information.</Body>
          <Caption>Caption 13: times, IDs and notes.</Caption>
          <AmountText cents={420} size="display" />
          <AmountText cents={123456} size="title" />
          <AmountText cents={7} />
        </Card>
      </Section>

      <Section title="Colour" description="Token names; contrast is checked in tests.">
        <Card>
          <View className="flex-row flex-wrap gap-3">
            {SWATCHES.map((name) => (
              <View key={name} className="w-24 gap-1">
                <View
                  className="h-12 rounded-control border border-line-subtle"
                  style={{ backgroundColor: colors[name] }}
                />
                <Text className="text-caption text-ink-muted">{name}</Text>
              </View>
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Buttons">
        <Button label="Primary" icon="qr-code-outline" onPress={() => undefined} />
        <Button tone="secondary" label="Secondary" onPress={() => undefined} />
        <Button tone="tertiary" label="Tertiary" onPress={() => undefined} />
        <Button tone="danger" label="Refund €4.20" onPress={() => undefined} />
        <Button label="Disabled" disabled onPress={() => undefined} />
        <Button
          label={busy ? 'Busy (tap the next button)' : 'Tap me: busy keeps the width'}
          busy={busy}
          onPress={() => setBusy(true)}
        />
        <Button tone="secondary" label="Reset busy" onPress={() => setBusy(false)} />
        <View className="flex-row gap-2">
          <IconButton icon="refresh" label="Refresh" onPress={() => undefined} />
          <IconButton icon="close" label="Close" onPress={() => undefined} />
          <IconButton
            icon="trash-outline"
            label="Delete (disabled)"
            disabled
            onPress={() => undefined}
          />
        </View>
      </Section>

      <Section title="Status">
        <View className="flex-row flex-wrap gap-2">
          {TONES.map((tone) => (
            <StatusPill key={tone} tone={tone} label={`${tone} status`} />
          ))}
        </View>
        <Tag icon="pricetag-outline" label="Tag: a fact, not a status" />
      </Section>

      <Section title="Notices" description="Text is one stop for screen readers; actions are not.">
        {TONES.map((tone) => (
          <Notice
            key={tone}
            tone={tone}
            title={`A ${tone} notice`}
            description="What happened, and what the user can do next."
            actions={
              tone === 'error' ? (
                <Button tone="secondary" label="Try again" onPress={() => undefined} />
              ) : undefined
            }
          />
        ))}
      </Section>

      <Section title="Lists">
        <Card>
          <ListRow
            title="Mensa am Campus"
            subtitle="04/11/2026, 17:03"
            value="€7.20"
            status={{ tone: 'ok', label: 'Confirmed' }}
            onPress={() => undefined}
            hint="Opens the payment"
          />
          <ListRow
            separated
            title="Mensa Nord"
            subtitle="04/11/2026, 12:11"
            value="€4.50"
            status={{ tone: 'pending', label: 'Being checked' }}
            onPress={() => undefined}
          />
          <ListRow separated title="Read-only row" value="€0.90" />
          <ListRow
            separated
            icon="school-outline"
            title="With an icon"
            subtitle="A demo account row"
            onPress={() => undefined}
          />
          <ListRow separated icon="briefcase-outline" title="Busy" busy onPress={() => undefined} />
          <ListRow
            separated
            icon="person-outline"
            title="Disabled"
            disabled
            onPress={() => undefined}
          />
          <LabelledValue label="Labelled value" value="pay_41fe7c8855aafc91" />
        </Card>
      </Section>

      <Section title="Fields">
        <TextField
          label="Refund amount"
          hint="In euros, for example 1,50"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          error={decimals.length > 2 ? 'Use at most two decimal places.' : null}
        />
        <PasswordField
          label="Password"
          showLabel="Show password"
          hideLabel="Hide password"
          value={pin}
          onChangeText={setPin}
        />
        <TextField label="Not editable" value="ord_4426620cc8075837" editable={false} />
      </Section>

      <Section title="Empty and loading">
        <Card>
          <EmptyState
            icon="receipt-outline"
            title="No payments yet"
            description="Payments you make at the till appear here."
            action={<Button tone="secondary" label="Pay at the till" onPress={() => undefined} />}
          />
        </Card>
        <Card>
          <LoadingIndicator label="Loading payments" />
          <Skeleton width="60%" height={18} />
          <Skeleton height={14} />
          <Skeleton width={120} height={24} rounded="full" />
        </Card>
      </Section>
    </Screen>
  );
}
