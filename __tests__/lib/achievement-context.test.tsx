import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AchievementProvider, useAchievementCheck } from '@/lib/achievement-context';
import * as achievementService from '@/lib/achievement-service';

jest.mock('@/lib/achievement-service', () => ({
  checkAchievements: jest.fn(),
}));

// The real celebration modal pulls in reanimated/haptics — irrelevant to
// this test, which is only about when the celebration fires vs. the cache
// invalidation. Render a plain marker so we can assert visibility directly.
jest.mock('@/components/achievement-celebration', () => {
  const { Text: RNText } = require('react-native');
  return {
    AchievementCelebration: ({ achievement, visible }: { achievement: { name: string } | null; visible: boolean }) =>
      visible ? <RNText testID="celebration">{achievement?.name}</RNText> : null,
  };
});

const checkAchievementsMock = achievementService.checkAchievements as jest.Mock;

const AWARDED = [
  {
    achievement: { icon: '🎬', name: 'First Take', description: 'Post a review' },
    level: 1,
    level_description: 'Post your first review',
    unlocked_at: '2024-01-01T00:00:00Z',
  },
];

function TestHarness() {
  const { triggerAchievementCheck } = useAchievementCheck();
  return (
    <Pressable testID="trigger" onPress={triggerAchievementCheck}>
      <Text>trigger</Text>
    </Pressable>
  );
}

function renderWithProviders() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AchievementProvider>
        <TestHarness />
      </AchievementProvider>
    </QueryClientProvider>
  );
  return { ...utils, invalidateSpy };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AchievementProvider — triggerAchievementCheck', () => {
  it('revoke-only response invalidates userAchievements but never celebrates', async () => {
    checkAchievementsMock.mockResolvedValue({
      newlyAwarded: [],
      revoked: [{ achievement_id: 'ach-1', level: 2 }],
    });
    const { getByTestId, queryByTestId, invalidateSpy } = renderWithProviders();

    fireEvent.press(getByTestId('trigger'));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['userAchievements'] })
    );
    expect(queryByTestId('celebration')).toBeNull();
  });

  it('award-only response invalidates and celebrates, exactly as today (regression guard)', async () => {
    checkAchievementsMock.mockResolvedValue({ newlyAwarded: AWARDED, revoked: [] });
    const { getByTestId, findByTestId, invalidateSpy } = renderWithProviders();

    fireEvent.press(getByTestId('trigger'));

    await findByTestId('celebration');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['userAchievements'] });
  });

  it('both present: invalidates once and celebrates only the award', async () => {
    checkAchievementsMock.mockResolvedValue({
      newlyAwarded: AWARDED,
      revoked: [{ achievement_id: 'ach-2', level: 1 }],
    });
    const { getByTestId, findByTestId, invalidateSpy } = renderWithProviders();

    fireEvent.press(getByTestId('trigger'));

    await findByTestId('celebration');
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('neither present: no invalidation, no celebration (unchanged)', async () => {
    checkAchievementsMock.mockResolvedValue({ newlyAwarded: [], revoked: [] });
    const { getByTestId, queryByTestId, invalidateSpy } = renderWithProviders();

    fireEvent.press(getByTestId('trigger'));

    await waitFor(() => expect(checkAchievementsMock).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(queryByTestId('celebration')).toBeNull();
  });

  it('does not crash when the resolved result is missing the revoked field entirely (mismatched deploy versions)', async () => {
    // Simulates a defect/edge case one layer below achievement-service's own
    // normalization — the context's destructuring default must hold too.
    checkAchievementsMock.mockResolvedValue({ newlyAwarded: [] } as unknown as {
      newlyAwarded: typeof AWARDED;
      revoked: { achievement_id: string; level: number }[];
    });
    const { getByTestId, queryByTestId, invalidateSpy } = renderWithProviders();

    expect(() => fireEvent.press(getByTestId('trigger'))).not.toThrow();
    await waitFor(() => expect(checkAchievementsMock).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(queryByTestId('celebration')).toBeNull();
  });
});
