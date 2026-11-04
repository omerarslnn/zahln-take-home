import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Caption, Heading } from './Text';

/** A white surface on the canvas, outlined by a hairline; its title is a heading. */
export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-card border border-line-subtle bg-surface p-4">
      {title ? <Heading>{title}</Heading> : null}
      {children}
    </View>
  );
}

/** A titled group without a surface, for content that sits directly on the canvas. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Heading>{title}</Heading>
        {description ? <Caption>{description}</Caption> : null}
      </View>
      {children}
    </View>
  );
}

/** Read as one phrase by screen readers ("label: value") instead of two separate stops. */
export function LabelledValue({ label, value }: { label: string; value: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`}>
      <Text className="text-caption text-ink-muted">{label}</Text>
      <Text className="text-body font-semibold text-ink">{value}</Text>
    </View>
  );
}
