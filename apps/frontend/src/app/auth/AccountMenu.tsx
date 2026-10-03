import type React from 'react';
import { useAuth } from 'react-oidc-context';
import { Avatar, Button, cssVar } from '@task-manager-v2/ui-kit';

/** The signed-in user and the way out. */
export const AccountMenu: React.FC = () => {
  const auth = useAuth();
  const profile = auth.user?.profile;
  if (!profile) return null;

  const name = profile.name || profile.preferred_username || profile.email || 'Account';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: cssVar('sp-2') }}>
      <Avatar size="sm" name={name} id={profile.sub} />
      <Button variant="ghost" size="sm" onClick={() => void auth.signoutRedirect()}>
        Sign out
      </Button>
    </div>
  );
};

export default AccountMenu;
