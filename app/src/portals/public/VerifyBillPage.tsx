import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatINR } from '../../domain/utils/money';
import { verifyBillPayload } from '../../services/verifyBillService';
import { Button, Field, Textarea } from '../../ui/components/primitives';

export function VerifyBillPage() {
  const [params] = useSearchParams();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof verifyBillPayload>> | null>(null);

  useEffect(() => {
    const p = params.get('p');
    const payload = params.get('payload');
    if (!p && !payload) return;
    const encoded = p
      ? `${window.location.origin}/verify-bill?p=${p}`
      : `${window.location.origin}/verify-bill?payload=${encodeURIComponent(payload!)}`;
    setRaw(encoded);
    setBusy(true);
    void verifyBillPayload(encoded).then((r) => {
      setResult(r);
      setBusy(false);
    });
  }, [params]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <h1 className="auth-brand">DigiSwasthya</h1>
        <p className="auth-sub">Verify a bill from this local installation</p>
        <Field label="Paste QR payload or verify URL">
          <Textarea
            rows={6}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Scan the bill QR, or paste the verify URL / JSON payload"
          />
        </Field>
        <Button
          disabled={busy || !raw.trim()}
          onClick={async () => {
            setBusy(true);
            setResult(await verifyBillPayload(raw));
            setBusy(false);
          }}
        >
          {busy ? 'Checking…' : 'Verify'}
        </Button>
        {result ? (
          <div className="stack" style={{ marginTop: 12, fontSize: 14 }}>
            {result.outcome === 'Genuine' ? (
              <>
                <strong style={{ color: 'var(--ok, #0a7)' }}>
                  Genuine{result.voided ? ' — VOIDED' : ''}
                </strong>
                {result.voided && result.voidDate ? (
                  <div className="muted">Voided {new Date(result.voidDate).toLocaleString()}</div>
                ) : null}
                <div>
                  {result.summary.invoiceNo} · {result.summary.stockistName} → {result.summary.pharmacyName}
                </div>
                <div>
                  Total {formatINR(result.summary.grandTotal)} · Issued{' '}
                  {new Date(result.summary.issuedAt).toLocaleDateString()}
                </div>
              </>
            ) : null}
            {result.outcome === 'Mismatch' ? (
              <>
                <strong style={{ color: 'var(--danger, #c33)' }}>Mismatch</strong>
                <div>Differing fields: {result.differingFields.join(', ')}</div>
              </>
            ) : null}
            {result.outcome === 'NotFound' ? (
              <>
                <strong>Not found</strong>
                <div className="muted">{result.reason}</div>
              </>
            ) : null}
          </div>
        ) : null}
        <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
          <Link to="/auth/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
