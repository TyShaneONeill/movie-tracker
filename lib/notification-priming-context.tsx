import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  checkFirstWinPriming,
  acceptPriming,
  declinePriming,
} from './notification-priming-service';
import { NotificationPrimingSheet } from '@/components/notification-priming-sheet';
import { useDailyHooksEnabled } from '@/hooks/use-feature-flag';

interface NotificationPrimingContextValue {
  /** Call from a first-win event handler (first watchlist add / scan success). */
  triggerFirstWinCheck: () => void;
}

const NotificationPrimingContext = createContext<NotificationPrimingContextValue>({
  triggerFirstWinCheck: () => {},
});

export function useNotificationPriming() {
  return useContext(NotificationPrimingContext);
}

export function NotificationPrimingProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const dailyHooksEnabled = useDailyHooksEnabled();

  const triggerFirstWinCheck = useCallback(() => {
    // Ty-requested gate (pre-merge): daily_hooks must be checked BEFORE
    // checkFirstWinPriming() runs, because that function marks the
    // AsyncStorage "shown" flag as a side effect of returning show:true. If
    // we called it while the flag were off, flag-off users would be
    // permanently marked as shown and would never see the sheet once the
    // flag rolls out to them. Fails closed: dailyHooksEnabled is only true
    // for an affirmatively-resolved flag (or env override) — never on
    // undetermined/loading.
    if (!dailyHooksEnabled) return;
    checkFirstWinPriming()
      .then(({ show }) => {
        if (show) setVisible(true);
      })
      .catch(() => {});
  }, [dailyHooksEnabled]);

  const handleAccept = useCallback(() => {
    setVisible(false);
    acceptPriming().catch(() => {});
  }, []);

  const handleDecline = useCallback(() => {
    setVisible(false);
    declinePriming();
  }, []);

  return (
    <NotificationPrimingContext.Provider value={{ triggerFirstWinCheck }}>
      {children}
      <NotificationPrimingSheet
        visible={visible}
        onAccept={handleAccept}
        onDecline={handleDecline}
      />
    </NotificationPrimingContext.Provider>
  );
}
