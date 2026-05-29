import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

interface NetworkContextType {
  isOffline: boolean;
  isInternetReachable: boolean | null;
}

const NetworkContext = createContext<NetworkContextType>({
  isOffline: false,
  isInternetReachable: true,
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(true);

  useEffect(() => {
    // navigator.onLine (NetInfo's only web signal) is unreliable across
    // browsers and headless environments — it can report false even with a
    // working connection, producing a phantom "You're offline" banner on
    // pages that obviously loaded over the network. Real browsers already
    // surface their own offline UX, so skip the listener on web entirely
    // and stay in the optimistic default.
    if (Platform.OS === 'web') return;

    const unsubscribe = NetInfo.addEventListener(state => {
      // Treat the user as offline only on an explicit `false`. NetInfo emits
      // `null` for unknown/pending connectivity (cold start before the first
      // probe resolves); a null should not flash the banner.
      setIsOffline(state.isConnected === false);
      setIsInternetReachable(state.isInternetReachable);
    });
    return () => unsubscribe();
  }, []);

  const value = useMemo(() => ({
    isOffline,
    isInternetReachable,
  }), [isOffline, isInternetReachable]);

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

export const useNetwork = () => useContext(NetworkContext);
