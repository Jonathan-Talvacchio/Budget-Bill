import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useMoney } from '@/components/money';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Divider, Row, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { addDays, todayISO } from '@/domain/billing';
import { formatDueDate } from '@/domain/format';
import { categoryTotals, recentPriceChanges, subscriptionAudit } from '@/domain/insights';
import { CATEGORY_LABELS } from '@/domain/schema';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/state/store';

export default function Insights() {
  const bills = useStore((s) => s.vault!.bills);
  const today = todayISO();
  const totals = useMemo(() => categoryTotals(bills, today), [bills, today]);
  const audit = useMemo(() => subscriptionAudit(bills, today), [bills, today]);
  const changes = useMemo(() => recentPriceChanges(bills, addDays(today, -365)), [bills, today]);

  if (bills.length === 0) {
    return (
      <Screen>
        <Card>
          <ThemedText>Nothing to show yet.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Add a few bills to see where your money goes each month.
          </ThemedText>
          <Button label="Add a bill" onPress={() => router.push('/bill/new')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <CategoryChart totals={totals} />
      <Subscriptions audit={audit} />
      <PriceChanges changes={changes} />
    </Screen>
  );
}

/** Ranked horizontal bars: one series, one hue, each bar labelled with its value. */
function CategoryChart({ totals }: { totals: ReturnType<typeof categoryTotals> }) {
  const theme = useTheme();
  const format = useMoney();
  const max = Math.max(1, ...totals.map((t) => t.monthlyCents));
  const sum = totals.reduce((s, t) => s + t.monthlyCents, 0);
  return (
    <>
      <SectionTitle>Spending by category · per month</SectionTitle>
      <Card>
        {totals.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No active bills.
          </ThemedText>
        )}
        {totals.map((t) => {
          const share = sum ? Math.round((t.monthlyCents / sum) * 100) : 0;
          return (
            <View
              key={t.category}
              style={styles.barRow}
              accessible
              accessibilityLabel={`${CATEGORY_LABELS[t.category]}: ${format(t.monthlyCents)} per month, ${share}% of bills`}>
              <Row style={styles.between}>
                <ThemedText type="small">
                  {CATEGORY_LABELS[t.category]}
                  <ThemedText type="small" themeColor="textSecondary">
                    {'  '}
                    {t.count === 1 ? '1 bill' : `${t.count} bills`}
                  </ThemedText>
                </ThemedText>
                <ThemedText type="small">
                  {format(t.monthlyCents)}
                  <ThemedText type="small" themeColor="textSecondary">
                    {'  '}
                    {share}%
                  </ThemedText>
                </ThemedText>
              </Row>
              <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.bar,
                    { backgroundColor: theme.tint, width: `${(t.monthlyCents / max) * 100}%` },
                  ]}
                />
              </View>
            </View>
          );
        })}
        {totals.length > 0 && (
          <>
            <Divider />
            <Row style={styles.between}>
              <ThemedText type="smallBold">Total</ThemedText>
              <ThemedText type="smallBold">
                {format(sum)}/mo · {format(sum * 12)}/yr
              </ThemedText>
            </Row>
          </>
        )}
      </Card>
    </>
  );
}

function Subscriptions({ audit }: { audit: ReturnType<typeof subscriptionAudit> }) {
  const format = useMoney();
  return (
    <>
      <SectionTitle>Subscription check</SectionTitle>
      <Card>
        {audit.items.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No streaming, music, software or membership subscriptions yet.
          </ThemedText>
        ) : (
          <>
            <ThemedText>
              You spend <ThemedText type="smallBold">{format(audit.yearlyTotal)}</ThemedText> a year on{' '}
              {audit.items.length === 1 ? '1 subscription' : `${audit.items.length} subscriptions`}.
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Most expensive first. Anything you no longer use?
            </ThemedText>
            {audit.items.map(({ bill, yearlyCents }, i) => (
              <View key={bill.id}>
                {i > 0 && <Divider />}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/bill/edit', params: { id: bill.id } })}>
                  <Row style={styles.item}>
                    <View style={styles.grow}>
                      <ThemedText>{bill.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {CATEGORY_LABELS[bill.category]} · {format(bill.amountCents)}{' '}
                        {bill.frequency === 'yearly' ? 'a year' : bill.frequency === 'monthly' ? 'a month' : bill.frequency}
                      </ThemedText>
                    </View>
                    <ThemedText>{format(yearlyCents)}/yr</ThemedText>
                  </Row>
                </Pressable>
              </View>
            ))}
          </>
        )}
      </Card>
    </>
  );
}

function PriceChanges({ changes }: { changes: ReturnType<typeof recentPriceChanges> }) {
  const format = useMoney();
  return (
    <>
      <SectionTitle>Price changes · last 12 months</SectionTitle>
      <Card>
        {changes.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No price changes recorded. When you edit a bill’s amount, the old price is kept here.
          </ThemedText>
        ) : (
          changes.map((c, i) => {
            const diff = c.toCents - c.fromCents;
            return (
              <View key={`${c.bill.id}|${c.date}`}>
                {i > 0 && <Divider />}
                <Row style={styles.item}>
                  <View style={styles.grow}>
                    <ThemedText>{c.bill.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDueDate(c.date, true)} · {format(c.fromCents)} → {format(c.toCents)}
                    </ThemedText>
                  </View>
                  <ThemedText themeColor={diff > 0 ? 'negative' : 'positive'}>
                    {diff > 0 ? '▲ +' : '▼ −'}
                    {format(Math.abs(diff))}
                  </ThemedText>
                </Row>
              </View>
            );
          })
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  barRow: { gap: Spacing.one, paddingVertical: Spacing.one },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4, minWidth: 4 },
  item: { paddingVertical: Spacing.two },
  grow: { flex: 1 },
});
