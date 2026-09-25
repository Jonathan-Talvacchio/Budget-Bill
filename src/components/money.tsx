import { formatCents } from '@/domain/money';
import { useStore } from '@/state/store';

import { ThemedText, type ThemedTextProps } from './themed-text';

/** Formats cents in the vault's currency. */
export function useMoney() {
  const currency = useStore((s) => s.vault?.settings.currency ?? 'USD');
  return (cents: number) => formatCents(cents, currency);
}

export function Money({ cents, ...props }: ThemedTextProps & { cents: number }) {
  const format = useMoney();
  return <ThemedText {...props}>{format(cents)}</ThemedText>;
}
