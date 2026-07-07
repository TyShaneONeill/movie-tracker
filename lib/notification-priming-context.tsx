import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  checkFirstWinPriming,
  acceptPriming,
  declinePriming,
} from './notification-priming-service';
import { NotificationPrimingSheet } from '@/components/notification-priming-sheet';

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

  const triggerFirstWinCheck = useCallback(() => {
    checkFirstWinPriming()
      .then(({ show }) => {
        if (show) setVisible(true);
      })
      .catch(() => {});
  }, []);

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
