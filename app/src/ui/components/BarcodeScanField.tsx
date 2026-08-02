import { useRef, useState } from 'react';
import { Field, Input } from './primitives';

/** Keyboard-wedge friendly scan/search — Enter commits the buffer. */
export function BarcodeScanField({
  label = 'Scan barcode / SKU',
  placeholder = 'Scan or type SKU, then Enter',
  onScan,
  disabled,
}: {
  label?: string;
  placeholder?: string;
  onScan: (code: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  return (
    <Field label={label}>
      <Input
        ref={ref}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const code = value.trim();
          if (!code) return;
          onScan(code);
          setValue('');
          ref.current?.focus();
        }}
      />
    </Field>
  );
}
