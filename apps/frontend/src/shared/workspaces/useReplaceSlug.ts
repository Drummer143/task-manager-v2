import { useCallback } from 'react';
import { generatePath, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes';

/** Puts `slug` in place of the workspace's one; the rest of the address stays as it is. */
export const useReplaceSlug = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // The workspace route and anything below it
  const match = useMatch(`${ROUTES.WORKSPACE}/*`);
  const base = match?.pathnameBase;

  return useCallback(
    (workspaceSlug: string) => {
      if (base === undefined) return;

      // `pathnameBase` is the matched `/{slug}` as it is in the address, still encoded: the rest
      // is taken from the address byte for byte, not rebuilt from decoded params
      const rest = location.pathname.slice(base.length);

      navigate(
        {
          pathname: generatePath(ROUTES.WORKSPACE, { workspaceSlug }) + rest,
          search: location.search,
          hash: location.hash,
        },
        // The old address is not kept: Back would only bring the user here again
        { replace: true, state: location.state },
      );
    },
    [base, location, navigate],
  );
};
