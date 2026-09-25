import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Money, useMoney } from '@/components/money';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Divider, Row, Screen, SectionTitle, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  monthPeriod,
  parseISODate,
  summarize,
  todayISO,
  yearPeriod,
  type Occurrence,
} from '@/domain/billing';
import { formatDueDate } from '@/domain/format';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/state/store';

type Mode = 'month' | 'year';

export default function Dashboard() {
  const vault = useStore((s) => s.vault)!;
  const today = todayISO();
  const now = parseISODate(today);
  const [view, setView] = useState<Mode>('month');
  // Month cursor as a single index (year * 12 + month0) so stepping crosses years cleanly.
  const [cursor, setCursor] = useState(now.y * 12 + now.m - 1);
  const year = Math.floor(cursor / 12);
  const month = (cursor % 12) + 1;

  const period = view === 'month' ? monthPeriod(year, month) : yearPeriod(year);
  const summary = useMemo(
    () => summarize(vault.bills, vault.payments, vault.incomes, period),
    [vault, period.start, period.end], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const step = (dir: 1 | -1) => setCursor((c) => c + dir * (view === 'month' ? 1 : 12));

  return (
    <Screen>
      <Segmented
        options={[
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
        value={view}
        onChange={setView}
      />
      <Row style={styles.periodNav}>
        <NavArrow label="‹" hint="Previous" onPress={() => step(-1)} />
        <ThemedText type="smallBold">{period.label}</ThemedText>
        <NavArrow label="›" hint="Next" onPress={() => step(1)} />
      </Row>

      <LeftToSpend income={summary.income} left={summary.leftToSpend} />

      <View style={styles.grid}>
        <Stat label="Total bills" cents={summary.totalDue} />
        <Stat label="Paid" cents={summary.paid} />
        <Stat label="Still due" cents={summary.remaining} />
        <Stat label="Income" cents={summary.income} />
      </View>

      {vault.bills.length === 0 ? (
        <Card>
          <ThemedText>No bills yet.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Add rent, utilities, subscriptions and other recurring costs to see where your money
            goes.
          </ThemedText>
          <Button label="Add your first bill" onPress={() => router.push('/bill/new')} />
        </Card>
      ) : view === 'month' ? (
        <MonthList occurrences={summary.occurrences} today={today} />
      ) : (
        <YearBreakdown occurrences={summary.occurrences} year={year} />
      )}
    </Screen>
  );
}

function NavArrow({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={hint} style={styles.arrow}>
      <ThemedText type="subtitle" themeColor="tint">
        {label}
      </ThemedText>
    </Pressable>
  );
}

function LeftToSpend({ income, left }: { income: number; left: number }) {
  return (
    <Card style={styles.hero}>
      <ThemedText type="small" themeColor="textSecondary">
        Left to spend after bills
      </ThemedText>
      <Money cents={left} type="subtitle" themeColor={left < 0 ? 'negative' : 'positive'} />
      {income === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Add your income in Settings to see what is left after bills.
        </ThemedText>
      ) : left < 0 ? (
        <ThemedText type="small" themeColor="negative">
          Bills are more than your income for this period.
        </ThemedText>
      ) : null}
    </Card>
  );
}

function Stat({ label, cents }: { label: string; cents: number }) {
  return (
    <Card style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Money cents={cents} type="default" style={styles.statValue} />
    </Card>
  );
}

function MonthList({ occurrences, today }: { occurrences: Occurrence[]; today: string }) {
  const togglePaid = useStore((s) => s.togglePaid);
  const format = useMoney();
  const theme = useTheme();
  if (occurrences.length === 0) {
    return (
      <ThemedText themeColor="textSecondary" style={styles.center}>
        Nothing due this month.
      </ThemedText>
    );
  }
  return (
    <>
      <SectionTitle>Due this month</SectionTitle>
      <Card>
        {occurrences.map((o, i) => {
          const overdue = !o.paid && o.dueDate < today;
          return (
            <View key={`${o.bill.id}|${o.dueDate}`}>
              {i > 0 && <Divider />}
              <Row style={styles.item}>
                <Pressable
                  role="checkbox"
                  aria-checked={o.paid}
                  accessibilityLabel={`Mark ${o.bill.name} ${o.paid ? 'unpaid' : 'paid'}`}
                  onPress={() => togglePaid(o.bill, o.dueDate)}
                  style={[
                    styles.check,
                    { borderColor: o.paid ? theme.positive : theme.border },
                    o.paid && { backgroundColor: theme.positive },
                  ]}>
                  {o.paid && <ThemedText style={{ color: theme.onTint }}>✓</ThemedText>}
                </Pressable>
                <Pressable
                  style={styles.itemText}
                  onPress={() => router.push({ pathname: '/bill/edit', params: { id: o.bill.id } })}>
                  <ThemedText
                    style={o.paid && styles.paidText}
                    themeColor={o.paid ? 'textSecondary' : 'text'}>
                    {o.bill.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor={overdue ? 'negative' : 'textSecondary'}>
                    {o.paid ? 'Paid' : overdue ? 'Overdue' : 'Due'} {formatDueDate(o.dueDate)}
                  </ThemedText>
                </Pressable>
                <ThemedText themeColor={o.paid ? 'textSecondary' : 'text'}>
                  {format(o.amountCents)}
                </ThemedText>
              </Row>
            </View>
          );
        })}
      </Card>
      <Button label="Add a bill" variant="secondary" onPress={() => router.push('/bill/new')} />
    </>
  );
}

function YearBreakdown({ occurrences, year }: { occurrences: Occurrence[]; year: number }) {
  const format = useMoney();
  const months = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, total: 0, paid: 0 }));
  for (const o of occurrences) {
    const row = months[parseISODate(o.dueDate).m - 1];
    row.total += o.amountCents;
    if (o.paid) row.paid += o.amountCents;
  }
  return (
    <>
      <SectionTitle>Month by month</SectionTitle>
      <Card>
        {months.map((row, i) => (
          <View key={row.m}>
            {i > 0 && <Divider />}
            <Row style={styles.item}>
              <ThemedText style={styles.itemText}>{monthPeriod(year, row.m).label}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {row.paid > 0 ? `${format(row.paid)} paid · ` : ''}
              </ThemedText>
              <ThemedText>{format(row.total)}</ThemedText>
            </Row>
          </View>
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  periodNav: { justifyContent: 'space-between' },
  arrow: { paddingHorizontal: Spacing.three },
  hero: { alignItems: 'flex-start' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stat: { flexGrow: 1, flexBasis: 140 },
  statValue: { fontSize: 20, fontWeight: 600 },
  item: { paddingVertical: Spacing.two },
  itemText: { flex: 1 },
  paidText: { textDecorationLine: 'line-through' },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});
