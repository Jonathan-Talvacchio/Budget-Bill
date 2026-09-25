import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { DateField } from '@/components/date-field';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Field, Row, SectionTitle, Segmented } from '@/components/ui';
import { todayISO } from '@/domain/billing';
import { centsToInput, parseMoneyToCents } from '@/domain/money';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  FREQUENCIES,
  FREQUENCY_LABELS,
  isoDate,
  type Bill,
  type Category,
  type Frequency,
} from '@/domain/schema';
import { confirmAction } from '@/platform/dialog';
import { newId, useStore } from '@/state/store';

export type BillDefaults = {
  name: string;
  category: Category;
  frequency: Frequency;
  catalogId?: string;
};

type Props = {
  /** Existing bill when editing; omitted when adding. */
  bill?: Bill;
  defaults?: BillDefaults;
  onDone: () => void;
};

const FREQUENCY_OPTIONS = FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }));

export function BillForm({ bill, defaults, onDone }: Props) {
  const saveBill = useStore((s) => s.saveBill);
  const deleteBill = useStore((s) => s.deleteBill);
  const start = bill ?? defaults;

  const [name, setName] = useState(start?.name ?? '');
  const [amount, setAmount] = useState(bill ? centsToInput(bill.amountCents) : '');
  const [frequency, setFrequency] = useState<Frequency>(start?.frequency ?? 'monthly');
  const [category, setCategory] = useState<Category>(start?.category ?? 'other');
  const [anchorDate, setAnchorDate] = useState(bill?.anchorDate ?? todayISO());
  const [hasEnd, setHasEnd] = useState(Boolean(bill?.endDate));
  const [endDate, setEndDate] = useState(bill?.endDate ?? '');
  const [notes, setNotes] = useState(bill?.notes ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const cents = parseMoneyToCents(amount);
  const errors = {
    name: name.trim() ? null : 'Give this bill a name.',
    amount: cents === null ? 'Enter an amount like 15 or 15.99' : null,
    anchorDate: isoDate.safeParse(anchorDate).success ? null : 'Choose a valid date.',
    endDate:
      !hasEnd
        ? null
        : !isoDate.safeParse(endDate).success
          ? 'Choose a valid date.'
          : endDate < anchorDate
            ? 'End date must be after the first due date.'
            : null,
  };
  const valid = Object.values(errors).every((e) => e === null);

  async function save() {
    setSubmitted(true);
    if (!valid || cents === null) return;
    setBusy(true);
    const now = new Date().toISOString();
    try {
      await saveBill({
        id: bill?.id ?? newId(),
        name: name.trim(),
        catalogId: start?.catalogId,
        category,
        amountCents: cents,
        frequency,
        anchorDate,
        endDate: hasEnd ? endDate : undefined,
        notes: notes.trim() || undefined,
        createdAt: bill?.createdAt ?? now,
        updatedAt: now,
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!bill) return;
    const ok = await confirmAction(
      `Delete ${bill.name}?`,
      'This removes the bill and its payment history.',
      'Delete',
    );
    if (!ok) return;
    await deleteBill(bill.id);
    onDone();
  }

  const show = (e: string | null) => (submitted ? e : null);

  return (
    <>
      <Card>
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          maxLength={80}
          error={show(errors.name)}
        />
        <Field
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={!bill}
          error={show(errors.amount)}
        />
        <ThemedText type="small" themeColor="textSecondary">
          How often
        </ThemedText>
        <Segmented options={FREQUENCY_OPTIONS} value={frequency} onChange={setFrequency} />
        <DateField
          label={bill ? 'First due date' : 'Next due date'}
          value={anchorDate}
          onChange={setAnchorDate}
          error={show(errors.anchorDate)}
        />
        <Row>
          <Chip
            label={hasEnd ? '✓ Ends on a date' : 'Ends on a date'}
            selected={hasEnd}
            onPress={() => setHasEnd(!hasEnd)}
          />
        </Row>
        {hasEnd && (
          <DateField label="Last payment date" value={endDate} onChange={setEndDate} error={show(errors.endDate)} />
        )}
      </Card>

      <SectionTitle>Category</SectionTitle>
      <Row style={styles.wrap}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={CATEGORY_LABELS[c]} selected={c === category} onPress={() => setCategory(c)} />
        ))}
      </Row>

      <Field
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        maxLength={500}
        multiline
        style={styles.notes}
        hint="Avoid storing account numbers or passwords here."
      />

      <Button label={bill ? 'Save changes' : 'Add bill'} onPress={save} busy={busy} />
      {submitted && !valid && (
        <ThemedText type="small" themeColor="negative">
          Please fix the highlighted fields.
        </ThemedText>
      )}
      {bill && <Button label="Delete bill" variant="danger" onPress={remove} />}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexWrap: 'wrap' },
  notes: { minHeight: 80, textAlignVertical: 'top' },
});
