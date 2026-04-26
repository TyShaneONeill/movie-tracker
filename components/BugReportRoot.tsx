import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useBugReport, BugReportProvider } from '@/contexts/BugReportContext';
import { BugReportModal } from './BugReportModal';
import { BugReportConfirmModal } from './BugReportConfirmModal';
import { useShakeGesture } from '@/hooks/useShakeGesture';
import { useAuth } from '@/hooks/use-auth';
import { captureBugReportScreenshot } from '@/lib/bug-report-screenshot';
import { hapticImpact, ImpactFeedbackStyle } from '@/lib/haptics';

function BugReportShake() {
  const { user } = useAuth();
  const { openBugReport } = useBugReport();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingScreenshot, setPendingScreenshot] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(true);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const onShake = useCallback(async () => {
    // Fire the haptic first so the user gets immediate tactile confirmation
    // that the shake registered, before the screenshot capture introduces
    // any perceptible delay.
    hapticImpact(ImpactFeedbackStyle.Medium);
    const shot = await captureBugReportScreenshot();
    setPendingScreenshot(shot);
    setConfirmVisible(true);
  }, []);

  useShakeGesture({
    onShake,
    enabled: !!user && appActive && Platform.OS === 'ios',
  });

  return (
    <BugReportConfirmModal
      visible={confirmVisible}
      onYes={() => {
        setConfirmVisible(false);
        openBugReport('shake', pendingScreenshot);
      }}
      onCancel={() => {
        setConfirmVisible(false);
        setPendingScreenshot(null);
      }}
    />
  );
}

export function BugReportRoot({ children }: { children: React.ReactNode }) {
  return (
    <BugReportProvider>
      {children}
      <BugReportShake />
      <BugReportModal />
    </BugReportProvider>
  );
}
