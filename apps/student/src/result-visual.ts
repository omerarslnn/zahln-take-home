// How the result screen looks for each payment display, as a pure function. The words and tone are
// `describeOutcome`'s; this adds the hero icon and whether the screen may celebrate.
import type { PaymentDisplay } from '@mensa/domain';
import type { IconName, Tone } from './components/ui';

export interface OutcomeVisual {
  icon: IconName;
  /** A short success animation: only for a payment the server confirmed. */
  celebrate: boolean;
}

/**
 * The hero icon per display. "Outcome not known yet" has its own question-mark icon, neither the
 * paid tick nor the declined cross: an unanswered payment must never look settled.
 */
export function outcomeVisual(display: PaymentDisplay, tone: Tone): OutcomeVisual {
  switch (display) {
    case 'confirmed':
      return { icon: 'checkmark-circle', celebrate: true };
    case 'declined':
      return { icon: 'close-circle', celebrate: false };
    case 'pending':
      return { icon: 'time', celebrate: false };
    case 'checking':
      return { icon: 'help-circle', celebrate: false };
    case 'sending':
      return { icon: 'cloud-upload', celebrate: false };
    case 'not_sent':
      return { icon: 'pause-circle', celebrate: false };
    case 'refused':
      return { icon: tone === 'neutral' ? 'information-circle' : 'close-circle', celebrate: false };
  }
}
