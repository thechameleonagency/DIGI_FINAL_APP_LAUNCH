import type { OperationalRole } from '../../domain/entities/types';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button, Field, Select } from './primitives';

const PHARMACY_PREVIEW: OperationalRole[] = ['Manager', 'Staff', 'Accountant', 'DeliveryBoy'];
const STOCKIST_PREVIEW: OperationalRole[] = ['Manager', 'Staff', 'Accountant', 'DeliveryBoy'];

/** CF-34: Owner-only UI gating preview — actions remain audited as Owner. */
export function RolePreviewControls() {
  const { user, business, rolePreview, setRolePreview } = useSession();
  const { pushToast } = useUi();

  if (!user || !business || user.role !== 'Owner' || business.type === 'Platform') return null;

  const options = business.type === 'Pharmacy' ? PHARMACY_PREVIEW : STOCKIST_PREVIEW;

  return (
    <div className="card card-pad stack">
      <strong>Preview as role</strong>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Trims navigation and action visibility only. Any change you make is still performed and audited as Owner.
      </p>
      <Field label="Preview role">
        <Select
          value={rolePreview ?? ''}
          onChange={(e) => {
            const v = e.target.value as OperationalRole | '';
            setRolePreview(v || null);
            pushToast({
              tone: 'info',
              title: v ? `Previewing as ${v}` : 'Exited role preview',
            });
          }}
        >
          <option value="">Owner (no preview)</option>
          {options.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </Field>
      {rolePreview ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => setRolePreview(null)}>
          Exit preview
        </Button>
      ) : null}
    </div>
  );
}
