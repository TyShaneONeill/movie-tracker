import { useMemo } from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useTour } from '@/lib/onboarding/tour-context';
import { hapticImpact } from '@/lib/haptics';

const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 14;
const TOOLTIP_OFFSET = 16;
const TOOLTIP_MAX_WIDTH = 360;
const TOOLTIP_MIN_HEIGHT_ESTIMATE = 200;

export function TourOverlay() {
  const { isActive, currentStep, currentStepIndex, totalSteps, targets, next, skip } = useTour();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const target = currentStep ? targets.get(currentStep.targetId) ?? null : null;

  const spotlight = useMemo(() => {
    if (!target) return null;
    return {
      x: target.x - SPOTLIGHT_PADDING,
      y: target.y - SPOTLIGHT_PADDING,
      width: target.width + SPOTLIGHT_PADDING * 2,
      height: target.height + SPOTLIGHT_PADDING * 2,
    };
  }, [target]);

  // Pick above/below based on the step's preferred placement, but fall back
  // to whichever side has more room.
  const tooltipPosition = useMemo(() => {
    if (!currentStep) return null;
    if (!spotlight) {
      // No measurement yet — center the card vertically.
      return { top: undefined, bottom: undefined, centered: true as const };
    }
    const spaceAbove = spotlight.y - insets.top - TOOLTIP_OFFSET;
    const spaceBelow = screenH - (spotlight.y + spotlight.height) - insets.bottom - TOOLTIP_OFFSET;
    const preferBelow = currentStep.tooltipPlacement === 'below';

    const placeBelow = preferBelow
      ? spaceBelow >= TOOLTIP_MIN_HEIGHT_ESTIMATE || spaceBelow >= spaceAbove
      : spaceAbove < TOOLTIP_MIN_HEIGHT_ESTIMATE && spaceBelow >= TOOLTIP_MIN_HEIGHT_ESTIMATE;

    if (placeBelow) {
      return {
        top: spotlight.y + spotlight.height + TOOLTIP_OFFSET,
        bottom: undefined,
        centered: false as const,
      };
    }
    return {
      top: undefined,
      bottom: screenH - spotlight.y + TOOLTIP_OFFSET,
      centered: false as const,
    };
  }, [spotlight, currentStep, insets, screenH]);

  if (!isActive || !currentStep) return null;

  const isLast = currentStepIndex === totalSteps - 1;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        {/* Dim layer with optional spotlight cutout via SVG mask. */}
        {spotlight ? (
          <Svg
            width={screenW}
            height={screenH}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Defs>
              <Mask id="spotlight-mask">
                <Rect x={0} y={0} width={screenW} height={screenH} fill="white" />
                <Rect
                  x={spotlight.x}
                  y={spotlight.y}
                  width={spotlight.width}
                  height={spotlight.height}
                  rx={SPOTLIGHT_RADIUS}
                  ry={SPOTLIGHT_RADIUS}
                  fill="black"
                />
              </Mask>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={screenW}
              height={screenH}
              fill="rgba(0,0,0,0.78)"
              mask="url(#spotlight-mask)"
            />
          </Svg>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.fallbackDim]} pointerEvents="none" />
        )}

        {/* Tooltip card */}
        {tooltipPosition && (
          <View
            pointerEvents="box-none"
            style={[
              styles.tooltipContainer,
              tooltipPosition.centered
                ? styles.tooltipContainerCentered
                : {
                    top: tooltipPosition.top,
                    bottom: tooltipPosition.bottom,
                  },
            ]}
          >
            <View
              style={[
                styles.tooltip,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <ThemedText style={[styles.stepCounter, { color: colors.textTertiary }]}>
                Step {currentStepIndex + 1} of {totalSteps}
              </ThemedText>
              <ThemedText style={[styles.title, { color: colors.text }]}>
                {currentStep.title}
              </ThemedText>
              <ThemedText style={[styles.body, { color: colors.textSecondary }]}>
                {currentStep.body}
              </ThemedText>

              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => {
                    hapticImpact();
                    skip();
                  }}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Skip the tour"
                  hitSlop={8}
                >
                  <ThemedText
                    style={[styles.secondaryButtonText, { color: colors.textSecondary }]}
                  >
                    Skip
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => {
                    hapticImpact();
                    next();
                  }}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={isLast ? 'Finish tour' : 'Next step'}
                >
                  <ThemedText style={styles.primaryButtonText}>
                    {isLast ? 'Got it' : 'Next'}
                  </ThemedText>
                  {!isLast && (
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color="#fff"
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fallbackDim: {
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  tooltipContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  tooltipContainerCentered: {
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  tooltip: {
    width: '100%',
    maxWidth: TOOLTIP_MAX_WIDTH,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  stepCounter: {
    ...Typography.body.xs,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    ...Typography.display.h4,
    marginBottom: Spacing.sm,
  },
  body: {
    ...Typography.body.base,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  secondaryButtonText: {
    ...Typography.body.sm,
    fontWeight: '500',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
  },
  primaryButtonText: {
    color: '#fff',
    ...Typography.body.base,
    fontWeight: '700',
  },
});
