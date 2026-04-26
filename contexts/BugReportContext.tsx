import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface BugReportContextValue {
  visible: boolean;
  triggerSource: 'settings' | 'shake' | null;
  screenshotBase64: string | null;
  openBugReport: (source: 'settings' | 'shake', screenshot?: string | null) => void;
  closeBugReport: () => void;
}

const BugReportContext = createContext<BugReportContextValue | null>(null);

export function BugReportProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [triggerSource, setTriggerSource] = useState<'settings' | 'shake' | null>(null);
  const [screenshotBase64, setScreenshot] = useState<string | null>(null);

  const openBugReport = useCallback(
    (source: 'settings' | 'shake', screenshot: string | null = null) => {
      setTriggerSource(source);
      setScreenshot(screenshot);
      setVisible(true);
    },
    [],
  );

  const closeBugReport = useCallback(() => {
    setVisible(false);
    setTriggerSource(null);
    setScreenshot(null);
  }, []);

  const value = useMemo(
    () => ({ visible, triggerSource, screenshotBase64, openBugReport, closeBugReport }),
    [visible, triggerSource, screenshotBase64, openBugReport, closeBugReport],
  );

  return <BugReportContext.Provider value={value}>{children}</BugReportContext.Provider>;
}

export function useBugReport() {
  const ctx = useContext(BugReportContext);
  if (!ctx) throw new Error('useBugReport must be used inside BugReportProvider');
  return ctx;
}
