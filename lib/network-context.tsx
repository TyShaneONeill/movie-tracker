import React, { createContext, useContext, useState, useEffect } from 'react';
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
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
      setIsInternetReachable(state.isInternetReachable);
    });
    return () => unsubscribe();
  }, []);

  return (
    <NetworkContext.Provider value={{ isOffline, isInternetReachable }}>
      {children}
    </NetworkContext.Provider>
  );
}

export const useNetwork = () => useContext(NetworkContext);
