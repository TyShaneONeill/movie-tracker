import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { hasTourCompleted, markTourCompleted, resetTour } from './tour-state';
import { TOUR_STEPS, type TourStep } from './tour-steps';

export interface TargetMeasurement {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TourContextValue {
  isActive: boolean;
  currentStep: TourStep | null;
  currentStepIndex: number;
  totalSteps: number;
  targets: ReadonlyMap<string, TargetMeasurement>;
  startTourIfNotCompleted: () => Promise<void>;
  next: () => void;
  skip: () => void;
  replay: () => Promise<void>;
  registerTarget: (id: string, measurement: TargetMeasurement) => void;
  unregisterTarget: (id: string) => void;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

export function TourProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targets, setTargets] = useState<Map<string, TargetMeasurement>>(new Map());

  const currentStep = useMemo(() => {
    if (!isActive || currentStepIndex >= TOUR_STEPS.length) return null;
    return TOUR_STEPS[currentStepIndex];
  }, [isActive, currentStepIndex]);

  const startTourIfNotCompleted = useCallback(async () => {
    const completed = await hasTourCompleted();
    if (completed) return;
    setCurrentStepIndex(0);
    setIsActive(true);
  }, []);

  const next = useCallback(() => {
    setCurrentStepIndex((idx) => {
      const nextIdx = idx + 1;
      if (nextIdx >= TOUR_STEPS.length) {
        setIsActive(false);
        // Fire and forget; tour-state already captures storage errors.
        markTourCompleted();
        return 0;
      }
      return nextIdx;
    });
  }, []);

  const skip = useCallback(() => {
    setIsActive(false);
    setCurrentStepIndex(0);
    markTourCompleted();
  }, []);

  const replay = useCallback(async () => {
    await resetTour();
    setCurrentStepIndex(0);
    setIsActive(true);
  }, []);

  const registerTarget = useCallback((id: string, measurement: TargetMeasurement) => {
    setTargets((prev) => {
      const existing = prev.get(id);
      if (
        existing &&
        existing.x === measurement.x &&
        existing.y === measurement.y &&
        existing.width === measurement.width &&
        existing.height === measurement.height
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(id, measurement);
      return next;
    });
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    setTargets((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      isActive,
      currentStep,
      currentStepIndex,
      totalSteps: TOUR_STEPS.length,
      targets,
      startTourIfNotCompleted,
      next,
      skip,
      replay,
      registerTarget,
      unregisterTarget,
    }),
    [
      isActive,
      currentStep,
      currentStepIndex,
      targets,
      startTourIfNotCompleted,
      next,
      skip,
      replay,
      registerTarget,
      unregisterTarget,
    ]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}
