import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useMoney } from '@/components/money';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Divider, Row, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { monthlyEquivalent, nextDueDate, todayISO } from '@/domain/billing';
import { formatDueDate } from '@/domain/format';
import { CATEGORY_LABELS, FREQUENCY_LABELS, type Category } from '@/domain/schema';
import { useStore } from '@/state/store';

export default function Bills() {
  const bills = useStore((s) => s.vault!.bills);
  const format = useMoney();
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const today = todayISO();

  const rows = useMemo(
    () =>
      bills
        .map((bill) => ({ bill, next: nextDueDate(bill, today) }))
        // Ended bills sink to the bottom; the rest are ordered by next due date.
        .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999')),
    [bills, today],
  );
  const categories = [...new Set(bills.map((b) => b.category))];
  const visible = rows.filter((r) => filter === 'all' || r.bill.category === filter);
  const active = rows.filter((r) => r.next !== null);
  const monthly = active.reduce((s, r) => s + monthlyEquivalent(r.bill), 0);

  return (
    <Screen>
      <Card>
        <Row style={styles.between}>
          <ThemedText themeColor="textSecondary">Average per month</ThemedText>
          <ThemedText type="smallBold">{format(monthly)}</ThemedText>
        </Row>
        <Row style={styles.between}>
          <ThemedText themeColor="textSecondary">Per year</ThemedText>
          <ThemedText type="smallBold">{format(monthly * 12)}</ThemedText>
        </Row>
      </Card>

      <Button label="Add a bill" onPress={() => router.push('/bill/new')} />

      {categories.length > 1 && (
        <Row style={styles.wrap}>
          <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
          {categories.map((c) => (
            <Chip
              key={c}
              label={CATEGORY_LABELS[c]}
              selected={filter === c}
              onPress={() => setFilter(c)}
            />
          ))}
        </Row>
      )}

      {visible.length === 0 ? (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          No bills yet.
        </ThemedText>
      ) : (
        <>
          <SectionTitle>{visible.length === 1 ? '1 bill' : `${visible.length} bills`}</SectionTitle>
          <Card>
            {visible.map(({ bill, next }, i) => (
              <View key={bill.id}>
                {i > 0 && <Divider />}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/bill/edit', params: { id: bill.id } })}>
                  <Row style={styles.item}>
                    <View style={styles.grow}>
                      <ThemedText>{bill.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {FREQUENCY_LABELS[bill.frequency]} ·{' '}
                        {next ? `next ${formatDueDate(next, true)}` : 'ended'}
                      </ThemedText>
                    </View>
                    <View style={styles.amount}>
                      <ThemedText>{format(bill.amountCents)}</ThemedText>
                      {bill.frequency !== 'monthly' && (
                        <ThemedText type="small" themeColor="textSecondary">
                          ≈ {format(monthlyEquivalent(bill))}/mo
                        </ThemedText>
                      )}
                    </View>
                  </Row>
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  wrap: { flexWrap: 'wrap' },
  item: { paddingVertical: Spacing.two },
  grow: { flex: 1 },
  amount: { alignItems: 'flex-end' },
  center: { textAlign: 'center' },
});
