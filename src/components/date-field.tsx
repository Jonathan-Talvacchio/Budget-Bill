import { Field } from './ui';

type Props = { label: string; value: string; onChange: (iso: string) => void; error?: string | null };

/** Native fallback: typed YYYY-MM-DD until a native date picker is added. */
export function DateField({ label, value, onChange, error }: Props) {
  return (
    <Field
      label={label}
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      keyboardType="numbers-and-punctuation"
      maxLength={10}
      error={error}
    />
  );
}
