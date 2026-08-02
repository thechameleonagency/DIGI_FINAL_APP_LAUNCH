import { Button } from './primitives';

/** Wrapper that participates in the shared @media print rules (class invoice-document). */
export function PrintDocument({
  title,
  subtitle,
  children,
  printLabel = 'Print',
  id,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  printLabel?: string;
  id?: string;
}) {
  return (
    <div id={id} className="stack card card-pad invoice-document">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {subtitle ? (
            <div className="muted" style={{ fontSize: 13 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        <Button size="sm" variant="secondary" className="no-print" onClick={() => window.print()}>
          {printLabel}
        </Button>
      </div>
      {children}
    </div>
  );
}
