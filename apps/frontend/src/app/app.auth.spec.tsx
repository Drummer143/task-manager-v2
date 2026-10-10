import { act, render } from '@testing-library/react';
import type { AuthProviderProps } from 'react-oidc-context';

import { App } from './app';
import { userManager } from './auth';
import { router } from './router';
import { NIL_WORKSPACE_ID } from '../shared/constants/routes';

const provider = vi.hoisted(() => ({ props: undefined as AuthProviderProps | undefined }));

vi.mock('react-oidc-context', () => ({
  AuthProvider: (props: AuthProviderProps) => {
    provider.props = props;
    return props.children;
  },
  // Signed in: the protected routes render
  useAuth: () => ({ isLoading: false, isAuthenticated: true, user: null }),
}));

describe('App', () => {
  it('drives the app UserManager and leaves the callback to the callback screen', () => {
    render(<App />);

    expect(provider.props?.userManager).toBe(userManager);
    expect(provider.props?.skipSigninCallback).toBe(true);
  });

  it("starts at the default space's inbox", async () => {
    render(<App />);

    await act(() => router.navigate('/'));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe(`/${NIL_WORKSPACE_ID}/inbox`));
  });

  it("sends an unknown path inside a space to that space's inbox", async () => {
    render(<App />);

    await act(() => router.navigate('/ws-1/nowhere'));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/ws-1/inbox'));
  });
});
