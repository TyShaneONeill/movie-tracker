/**
 * Custom Toast Configuration
 * Styled to match the PocketStubs design system
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ToastConfig, BaseToast, BaseToastProps } from 'react-native-toast-message';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';

interface ToastProps extends BaseToastProps {
  text1?: string;
  text2?: string;
}

const SuccessToast = ({ text1, text2 }: ToastProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, styles.successContainer, { marginTop: insets.top }]}>
      <View style={[styles.accentBar, styles.successAccent]} />
      <View style={styles.content}>
        {text1 && <Text style={styles.title}>{text1}</Text>}
        {text2 && <Text style={styles.message}>{text2}</Text>}
      </View>
    </View>
  );
};

const ErrorToast = ({ text1, text2 }: ToastProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, styles.errorContainer, { marginTop: insets.top }]}>
      <View style={[styles.accentBar, styles.errorAccent]} />
      <View style={styles.content}>
        {text1 && <Text style={styles.title}>{text1}</Text>}
        {text2 && <Text style={styles.message}>{text2}</Text>}
      </View>
    </View>
  );
};

const InfoToast = ({ text1, text2 }: ToastProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, styles.infoContainer, { marginTop: insets.top }]}>
      <View style={[styles.accentBar, styles.infoAccent]} />
      <View style={styles.content}>
        {text1 && <Text style={styles.title}>{text1}</Text>}
        {text2 && <Text style={styles.message}>{text2}</Text>}
      </View>
    </View>
  );
};

export const toastConfig: ToastConfig = {
  success: (props) => <SuccessToast {...props} />,
  error: (props) => <ErrorToast {...props} />,
  info: (props) => <InfoToast {...props} />,
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    width: '90%',
    minHeight: 60,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  successContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)', // Emerald with opacity
  },
  errorContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.3)', // Rose with opacity
  },
  infoContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)', // Gold with opacity
  },
  accentBar: {
    width: 4,
  },
  successAccent: {
    backgroundColor: Colors.dark.accentSecondary, // Emerald 500
  },
  errorAccent: {
    backgroundColor: Colors.dark.tint, // Rose 600
  },
  infoAccent: {
    backgroundColor: Colors.dark.gold, // Amber 400
  },
  content: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  title: {
    fontFamily: Fonts.inter.semibold,
    fontSize: 15,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  message: {
    fontFamily: Fonts.inter.regular,
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
});
