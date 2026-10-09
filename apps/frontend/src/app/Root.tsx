import { KitRoot, RouterAdapter } from '@task-manager-v2/ui-kit';
import React, { useMemo } from 'react';
import { Outlet, useHref, useNavigate } from 'react-router-dom';
import { queryClient } from './queryClient';
import { QueryClientProvider } from '@tanstack/react-query';

export const Root: React.FC = () => {
  const navigate = useNavigate();

  const router: RouterAdapter = useMemo(() => {
    return {
      navigate,
      useHref,
    };
  }, [navigate]);

  return (
    <QueryClientProvider client={queryClient}>
      <KitRoot router={router}>
        <Outlet />
      </KitRoot>
    </QueryClientProvider>
  );
};
