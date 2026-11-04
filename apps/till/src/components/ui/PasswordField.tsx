import { useState } from 'react';
import { IconButton } from './Button';
import { TextField, type TextFieldProps } from './TextField';

/**
 * A password field with a show/hide button inside it. Hidden by default (`secureTextEntry`), and
 * marked as the account's current password so iOS Keychain, Google Autofill and password managers
 * offer it. The button is its own screen-reader stop after the field; its label says what it does
 * next ("Show password", "Hide password").
 */
export function PasswordField({
  showLabel,
  hideLabel,
  ...field
}: Omit<TextFieldProps, 'secureTextEntry' | 'trailing'> & {
  showLabel: string;
  hideLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      autoComplete="current-password"
      textContentType="password"
      importantForAutofill="yes"
      {...field}
      secureTextEntry={!visible}
      trailing={
        <IconButton
          icon={visible ? 'eye-off-outline' : 'eye-outline'}
          label={visible ? hideLabel : showLabel}
          onPress={() => setVisible((shown) => !shown)}
          disabled={field.editable === false}
        />
      }
    />
  );
}
