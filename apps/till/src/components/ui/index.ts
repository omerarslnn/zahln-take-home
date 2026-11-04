// The design system's native primitives, on the shared tokens (docs/design-system.md). The
// student app has an identical copy of this folder (`pnpm check:copies`). Every status has an icon and words,
// never colour alone; every control is at least 48 dp; nothing interactive sits inside a group
// that screen readers read as one element.
export { AmountText, tabularFigures } from './AmountText';
export { Button, IconButton } from './Button';
export { Card, LabelledValue, Section } from './Card';
export { EmptyState } from './EmptyState';
export { useAccessibilityFocus, useAnnouncement, useAppActive, useKeyboardOpen } from './hooks';
export { Icon, preloadIcons, type IconSize } from './Icon';
export { ListRow } from './ListRow';
export { LoadingIndicator, Skeleton } from './Loading';
export { Notice } from './Notice';
export { PasswordField } from './PasswordField';
export { BottomActionBar, Screen } from './Screen';
export { StatusPill } from './StatusPill';
export { toneIcon, type ButtonTone, type IconName, type Tone } from './styles';
export { TextField, type TextFieldProps } from './TextField';
export { Body, Caption, Heading, Title } from './Text';
