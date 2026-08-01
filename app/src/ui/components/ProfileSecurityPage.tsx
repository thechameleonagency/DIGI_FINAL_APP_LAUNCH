import { useState } from 'react';
import { changePassword, updateProfile } from '../../services/authService';
import { portalFor } from '../../domain/permissions';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { PreferencesPanel } from './PreferencesPanel';
import { Button, Field, Input, PageHeader } from './primitives';

export function ProfileSecurityPage() {
  const { user, business, setSession } = useSession();
  const { pushToast } = useUi();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  if (!user || !business) return null;
  const portal = portalFor(business.type);
  const helpPath = `/${portal}/help`;
  const profilePath = `/${portal}/profile`;

  return (
    <div className="stack">
      <PageHeader title="Profile & security" subtitle="Update your name, phone, and password" />
      <div className="card card-pad stack">
        <strong>Profile</strong>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={user.email} disabled />
        </Field>
        <Button
          onClick={async () => {
            const res = await updateProfile({ actor: user, name, phone });
            if (res.ok) {
              setSession(res.data, business);
              pushToast({ tone: 'success', title: 'Profile updated' });
            } else pushToast({ tone: 'error', title: res.message });
          }}
        >
          Save profile
        </Button>
      </div>
      <div className="card card-pad stack">
        <strong>Change password</strong>
        <Field label="Current password">
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </Field>
        <Field label="New password" hint="Min 6 characters">
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
        <Button
          onClick={async () => {
            const res = await changePassword({ actor: user, currentPassword, newPassword });
            if (res.ok) {
              pushToast({ tone: 'success', title: 'Password updated' });
              setCurrentPassword('');
              setNewPassword('');
            } else pushToast({ tone: 'error', title: res.message });
          }}
        >
          Update password
        </Button>
      </div>
      <PreferencesPanel profilePath={profilePath} helpPath={helpPath} />
    </div>
  );
}
