import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NotificationPrimingProvider,
  useNotificationPriming,
} from '@/lib/notification-priming-context';
import * as primingService from '@/lib/notification-priming-service';
import * as featureFlagModule from '@/hooks/use-feature-flag';

// The real sheet pulls in theme-context/haptics/react-native-svg — irrelevant
// to this test, which is only about the daily_hooks gate in triggerFirstWinCheck.
jest.mock('@/components/notification-priming-sheet', () => ({
  NotificationPrimingSheet: () => null,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useDailyHooksEnabled: jest.fn(),
}));

jest.mock('@/lib/notification-priming-service', () => ({
  checkFirstWinPriming: jest.fn(),
  acceptPriming: jest.fn(),
  declinePriming: jest.fn(),
}));

const useDailyHooksEnabledMock = featureFlagModule.useDailyHooksEnabled as jest.Mock;
const checkFirstWinPrimingMock = primingService.checkFirstWinPriming as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;

function TestHarness() {
  const { triggerFirstWinCheck } = useNotificationPriming();
  return (
    <Pressable testID="trigger" onPress={triggerFirstWinCheck}>
      <Text>trigger</Text>
    </Pressable>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NotificationPrimingProvider — daily_hooks flag gate', () => {
  it('flag OFF: triggerFirstWinCheck never calls checkFirstWinPriming or touches AsyncStorage', () => {
    useDailyHooksEnabledMock.mockReturnValue(false);
    const { getByTestId } = render(
      <NotificationPrimingProvider>
        <TestHarness />
      </NotificationPrimingProvider>
    );

    fireEvent.press(getByTestId('trigger'));

    expect(checkFirstWinPrimingMock).not.toHaveBeenCalled();
    expect(setItemMock).not.toHaveBeenCalled();
  });

  it('flag ON: triggerFirstWinCheck calls checkFirstWinPriming as before', async () => {
    useDailyHooksEnabledMock.mockReturnValue(true);
    checkFirstWinPrimingMock.mockResolvedValue({ show: true });
    const { getByTestId } = render(
      <NotificationPrimingProvider>
        <TestHarness />
      </NotificationPrimingProvider>
    );

    fireEvent.press(getByTestId('trigger'));

    await waitFor(() => expect(checkFirstWinPrimingMock).toHaveBeenCalledTimes(1));
  });
});
