import { useEffect, useState } from 'react';
import { getFile, storeFile } from '../../services/fileService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button } from './primitives';

export function FileUpload({
  label = 'Upload file',
  value,
  onChange,
  accept = 'application/pdf,image/jpeg,image/png',
}: {
  label?: string;
  value?: string;
  onChange: (fileId: string | undefined) => void;
  accept?: string;
}) {
  const { user } = useSession();
  const { pushToast } = useUi();
  const [busy, setBusy] = useState(false);

  return (
    <div className="stack">
      <div className="row">
        <label className="btn btn-secondary btn-sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Uploading…' : label}
          <input
            type="file"
            accept={accept}
            hidden
            disabled={busy || !user}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file || !user) return;
              setBusy(true);
              const res = await storeFile({ actor: user, file });
              setBusy(false);
              if (!res.ok) {
                pushToast({ tone: 'error', title: res.message, message: res.businessImpact });
                return;
              }
              onChange(res.data.id);
              pushToast({ tone: 'success', title: 'File stored', message: res.data.name });
            }}
          />
        </label>
        {value ? (
          <Button size="sm" variant="ghost" onClick={() => onChange(undefined)}>
            Remove
          </Button>
        ) : null}
      </div>
      {value ? <FileLink fileId={value} /> : null}
    </div>
  );
}

export function FileLink({ fileId, label }: { fileId: string; label?: string }) {
  const [name, setName] = useState(label ?? 'View file');
  const [href, setHref] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void getFile(fileId).then((f) => {
      if (cancelled || !f) return;
      setName(label ?? f.name);
      setHref(f.dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [fileId, label]);

  if (!href) return <span className="muted" style={{ fontSize: 12 }}>Loading file…</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600 }}>
      {name}
    </a>
  );
}
