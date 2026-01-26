/**
 * BottomSheetModal Component
 *
 * Slide-up modal with backdrop blur, drag handle, rounded top corners (24px),
 * and max-height 80vh. Matches ui-mocks/review_modal.html modal structure.
 */

import React, { useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Modal, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';


export interface BottomSheetModalHandle {
  present: () => void;
  dismiss: () => void;
  snapToIndex: (index: number) => void;
}

interface BottomSheetModalProps {
  children: React.ReactNode;
  enableDismissOnBackdropPress?: boolean;
  maxHeight?: number; // As percentage of screen height (0-100), default 80
  snapPoints?: string[]; // Default ['80%']
}

export const BottomSheetModalComponent = forwardRef<BottomSheetModalHandle, BottomSheetModalProps>(
  ({ children, enableDismissOnBackdropPress = true, maxHeight = 80, snapPoints: customSnapPoints }, ref) => {
    const { effectiveTheme } = useTheme();
    const colors = Colors[effectiveTheme];
    const [isVisible, setIsVisible] = React.useState(false);
    const bottomSheetRef = React.useRef<BottomSheet>(null);

    // Snap points define the heights the sheet can snap to
    const snapPoints = useMemo(() => customSnapPoints || [`${maxHeight}%`], [maxHeight, customSnapPoints]);

    // Expose imperative handle for parent components
    useImperativeHandle(ref, () => ({
      present: () => {
        setIsVisible(true);
        // Small delay to ensure Modal is rendered before expanding bottom sheet
        setTimeout(() => {
          bottomSheetRef.current?.expand();
        }, 100);
      },
      dismiss: () => {
        bottomSheetRef.current?.close();
      },
      snapToIndex: (index: number) => {
        bottomSheetRef.current?.snapToIndex(index);
      },
    }));

    // Handle bottom sheet changes
    const handleSheetChanges = useCallback((index: number) => {
      // Index -1 means the sheet is closed
      if (index === -1) {
        setIsVisible(false);
      }
    }, []);

    // Handle backdrop press
    const handleBackdropPress = useCallback(() => {
      if (enableDismissOnBackdropPress) {
        bottomSheetRef.current?.close();
      }
    }, [enableDismissOnBackdropPress]);

    return (
      <Modal
        visible={isVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => bottomSheetRef.current?.close()}
      >
        <GestureHandlerRootView style={styles.container}>
          {/* Custom blur backdrop */}
          <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
            <BlurView intensity={20} tint={effectiveTheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <View style={[styles.backdropOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]} />
          </Pressable>

          <BottomSheet
            ref={bottomSheetRef}
            index={-1}
            snapPoints={snapPoints}
            onChange={handleSheetChanges}
            enablePanDownToClose
            backgroundStyle={[
              styles.bottomSheetBackground,
              { backgroundColor: colors.card },
            ]}
            handleIndicatorStyle={[
              styles.handleIndicator,
              { backgroundColor: colors.border },
            ]}
          >
            <BottomSheetView style={styles.contentContainer}>
              {children}
            </BottomSheetView>
          </BottomSheet>
        </GestureHandlerRootView>
      </Modal>
    );
  }
);

BottomSheetModalComponent.displayName = 'BottomSheetModal';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomSheetBackground: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
});

// Export default for easier imports
export default BottomSheetModalComponent;
