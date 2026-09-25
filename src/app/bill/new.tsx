import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BillForm, type BillDefaults } from '@/components/bill-form';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Divider, Field, Row, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { searchCatalog } from '@/domain/catalog';
import { CATEGORIES, CATEGORY_LABELS, FREQUENCY_LABELS } from '@/domain/schema';
import { closeModal } from '@/platform/navigation';

export default function NewBill() {
  const [picked, setPicked] = useState<BillDefaults | null>(null);
  if (picked) {
    return (
      <Screen>
        <BillForm defaults={picked} onDone={closeModal} />
        <Button label="Back to list" variant="secondary" onPress={() => setPicked(null)} />
      </Screen>
    );
  }
  return <CatalogPicker onPick={setPicked} />;
}

function CatalogPicker({ onPick }: { onPick: (d: BillDefaults) => void }) {
  const [query, setQuery] = useState('');
  const results = searchCatalog(query);
  const groups = CATEGORIES.map((c) => ({ category: c, items: results.filter((r) => r.category === c) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <Screen>
      <Button
        label="+ Custom bill"
        onPress={() => onPick({ name: query.trim(), category: 'other', frequency: 'monthly' })}
      />
      <Field
        label="Or choose a common bill"
        value={query}
        onChangeText={setQuery}
        placeholder="Search: Netflix, rent, electric…"
        autoComplete="off"
      />
      {groups.length === 0 && (
        <ThemedText themeColor="textSecondary">No matches. Use “Custom bill” to add it.</ThemedText>
      )}
      {groups.map((g) => (
        <View key={g.category} style={styles.group}>
          <SectionTitle>{CATEGORY_LABELS[g.category]}</SectionTitle>
          <Card>
            {g.items.map((item, i) => (
              <View key={item.id}>
                {i > 0 && <Divider />}
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    onPick({
                      name: item.name,
                      category: item.category,
                      frequency: item.frequency,
                      catalogId: item.id,
                    })
                  }>
                  <Row style={styles.item}>
                    <ThemedText style={styles.grow}>{item.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {FREQUENCY_LABELS[item.frequency]}
                    </ThemedText>
                  </Row>
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.two },
  item: { paddingVertical: Spacing.two },
  grow: { flex: 1 },
});
