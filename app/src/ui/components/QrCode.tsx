import { encode } from 'uqr';

/** Minimal SVG QR for printable bills / scan-to-verify. */
export function QrCode({
  value,
  size = 128,
  title = 'QR code',
}: {
  value: string;
  size?: number;
  title?: string;
}) {
  const { data, size: modules } = encode(value, { ecc: 'M' });
  const cell = size / modules;
  const rects: string[] = [];
  for (let y = 0; y < modules; y++) {
    const row = data[y];
    for (let x = 0; x < modules; x++) {
      if (row[x]) {
        rects.push(`M${x * cell},${y * cell}h${cell}v${cell}h${-cell}z`);
      }
    }
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={title}
      style={{ display: 'block', background: '#fff' }}
    >
      <title>{title}</title>
      <path fill="#111" d={rects.join('')} />
    </svg>
  );
}
