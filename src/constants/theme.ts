/**
 * App colors for light and dark mode, plus shared spacing and fonts.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#F6F7F9',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6E8EC',
    textSecondary: '#5E6570',
    border: '#DDE1E6',
    tint: '#1F6FEB',
    onTint: '#FFFFFF',
    positive: '#1A7F37',
    negative: '#CF222E',
  },
  dark: {
    text: '#ECEDEE',
    background: '#0D1117',
    backgroundElement: '#161B22',
    backgroundSelected: '#262C36',
    textSecondary: '#9BA3AF',
    border: '#30363D',
    tint: '#4C8DF6',
    onTint: '#FFFFFF',
    positive: '#3FB950',
    negative: '#F85149',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = 12;
export const MaxContentWidth = 720;
