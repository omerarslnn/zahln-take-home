// What the primitives tell screen readers, as pure functions.

/**
 * One phrase for an element that is read as a whole (a list row, a summary): its visible parts in
 * reading order, joined with commas so screen readers pause between them. Empty parts are skipped.
 */
export function spokenPhrase(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(', ');
}

/**
 * A text field's label for screen readers: the visible label, then the error while there is one.
 * The error is part of the label, not a hint, because users can switch hints off and an error
 * must not go unheard; the visible error text is then hidden, so it is not read twice.
 */
export function fieldLabel(label: string, error?: string | null): string {
  return spokenPhrase([label, error]);
}
