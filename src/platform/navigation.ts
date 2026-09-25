import { router } from 'expo-router';

/** Returns to the previous screen, or home when opened directly (e.g. a reloaded deep link). */
export function closeModal() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
