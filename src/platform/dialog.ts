import { Alert } from 'react-native';

export function confirmAction(title: string, message: string, confirmLabel = 'OK'): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export function notify(title: string, message: string): void {
  Alert.alert(title, message);
}
