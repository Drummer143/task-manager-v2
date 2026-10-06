import { KitRoot, RouterAdapter } from '@task-manager-v2/ui-kit';
import React, { useMemo } from 'react';
import { Outlet, useHref, useNavigate } from 'react-router-dom';

export const Root: React.FC = () => {
  const navigate = useNavigate();

  const router: RouterAdapter = useMemo(() => {
    return {
      navigate,
      useHref
    };
  }, [navigate]);

  return (
    <KitRoot router={router}>
      <Outlet />
    </KitRoot>
  );
};
