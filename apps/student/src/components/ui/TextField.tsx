import { colors } from '@mensa/shared';
import { useState, type Ref } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { fieldLabel } from './a11y-text';
import { Icon } from './Icon';

export interface TextFieldProps extends Omit<
  TextInputProps,
  'className' | 'style' | 'accessibilityLabel' | 'placeholderTextColor'
> {
  /** Shown above the field and read by screen readers; never only a placeholder. */
  label: string;
  /** Help under the field while there is no error, e.g. the expected format. */
  hint?: string;
  /** What is wrong with the value; replaces the hint and is read as part of the field's label. */
  error?: string | null;
  ref?: Ref<TextInput>;
}

/**
 * A labelled text input. The visible label, hint and error are hidden from screen readers and
 * spoken by the input itself (label, then the error), so the field is one stop and nothing is read
 * twice. Everything else (`secureTextEntry`, `keyboardType`, `returnKeyType`, `onSubmitEditing`,
 * `autoComplete`…) is passed to the input; pass `ref` to move focus between fields. A screen that
 * validates on submit announces the result with `useAnnouncement`.
 */
export function TextField({ label, hint, error, editable = true, ref, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const border = error ? 'border-danger' : focused ? 'border-brand' : 'border-line';
  return (
    <View className="gap-2">
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        className="text-body font-medium text-ink"
      >
        {label}
      </Text>
      <TextInput
        ref={ref}
        {...input}
        editable={editable}
        accessibilityLabel={fieldLabel(label, error)}
        accessibilityHint={error ? undefined : hint}
        accessibilityState={{ disabled: !editable }}
        placeholderTextColor={colors.line}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        className={`min-h-touch rounded-control border px-3 py-3 text-body text-ink ${border} ${editable ? 'bg-surface' : 'bg-canvas'}`}
      />
      {error ? (
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          className="flex-row gap-2"
        >
          <Icon name="alert-circle" size="sm" color={colors.danger} />
          <Text className="flex-1 text-caption font-medium text-danger">{error}</Text>
        </View>
      ) : hint ? (
        <Text
          importantForAccessibility="no"
          accessibilityElementsHidden
          className="text-caption text-ink-muted"
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
