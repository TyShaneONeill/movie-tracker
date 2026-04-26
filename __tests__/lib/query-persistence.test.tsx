import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/lib/release-calendar-service', () => ({
  getReleaseCalendar: jest.fn().mockResolvedValue({
    days: [],
    dates_with_releases: ['2026-04-15'],
    total_results: 1,
  }),
  getWatchlistTmdbIds: jest.fn().mockResolvedValue(new Set()),
}));

// react-native-toast-message has no real test backend; stub it.
jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
}));

import { QueryProvider, RQ_PERSIST_KEY, queryClient } from '@/lib/query-client';
import { useReleaseCalendar } from '@/hooks/use-release-calendar';

function CalendarConsumer() {
  const { data } = useReleaseCalendar({ month: 4, year: 2026 });
  return <Text>{data ? 'has-data' : 'no-data'}</Text>;
}

function NonPersistedConsumer() {
  const { data } = useQuery({
    queryKey: ['userMovies', 'test-user'],
    queryFn: async () => 'sensitive-payload',
  });
  return <Text>{data ?? 'no-data'}</Text>;
}

function readPersistedQueryKeys(stored: string | null): string[] {
  if (stored === null) return [];
  const parsed = JSON.parse(stored) as {
    clientState?: { queries?: Array<{ queryKey: unknown[] }> };
  };
  const queries = parsed.clientState?.queries ?? [];
  return queries
    .map((q) => q.queryKey?.[0])
    .filter((k): k is string => typeof k === 'string');
}

describe('query-client persistence integration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    queryClient.clear();
  });

  it('persists release-calendar query data to AsyncStorage', async () => {
    const { findByText } = render(
      <QueryProvider>
        <CalendarConsumer />
      </QueryProvider>
    );

    await findByText('has-data');

    await waitFor(
      async () => {
        const stored = await AsyncStorage.getItem(RQ_PERSIST_KEY);
        const keys = readPersistedQueryKeys(stored);
        expect(keys).toContain('release-calendar');
      },
      { timeout: 3000 }
    );
  });

  it('does NOT persist non-release-calendar queries (filter whitelist)', async () => {
    const { findByText } = render(
      <QueryProvider>
        <CalendarConsumer />
        <NonPersistedConsumer />
      </QueryProvider>
    );

    await findByText('has-data');
    await findByText('sensitive-payload');

    await waitFor(
      async () => {
        const stored = await AsyncStorage.getItem(RQ_PERSIST_KEY);
        const keys = readPersistedQueryKeys(stored);
        expect(keys).toContain('release-calendar');
        expect(keys).not.toContain('userMovies');
      },
      { timeout: 3000 }
    );
  });
});
