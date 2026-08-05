import { QueryClient } from '@tanstack/react-query';

const MINUTE = 60 * 1000;

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 2 * MINUTE,
      gcTime: 15 * MINUTE,
    },
  },
});
