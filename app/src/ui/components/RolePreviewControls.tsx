import type { OperationalRole } from '../../domain/entities/types';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button, Field, Select } from './primitives';

/** CF-34: Primary account can preview DeliveryStaff UI gating only. */
export function RolePreviewControls() {
  const { user, business, rolePreview, setRolePreview } = useSession();
  const { pushToast } = useUi();

  if (!user || !business || business.type === 'Platform') return null;
  const isPrimary =
    (business.type === 'Pharmacy' && user.role === 'Pharmacist') ||
    (business.type === 'Stockist' && user.role === 'Stockist');
  if (!isPrimary) return null;

  const options: OperationalRole[] = ['DeliveryStaff'];

  return (
    <div className="card card-pad stack">
      <strong>Preview as role</strong>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Trims navigation and action visibility only. Changes are still audited as your primary role.
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
          <option value="">{user.role} (no preview)</option>
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
