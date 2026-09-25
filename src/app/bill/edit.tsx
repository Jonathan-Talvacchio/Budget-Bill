import { useLocalSearchParams } from 'expo-router';

import { BillForm } from '@/components/bill-form';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { closeModal } from '@/platform/navigation';
import { useStore } from '@/state/store';

// Uses ?id= rather than a dynamic [id] segment so the static GitHub Pages export needs one page.
export default function EditBill() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const bill = useStore((s) => s.vault?.bills.find((b) => b.id === id));
  if (!bill) {
    return (
      <Screen>
        <ThemedText>That bill no longer exists.</ThemedText>
        <Button label="Back" onPress={closeModal} />
      </Screen>
    );
  }
  return (
    <Screen>
      <BillForm key={bill.id} bill={bill} onDone={closeModal} />
    </Screen>
  );
}
