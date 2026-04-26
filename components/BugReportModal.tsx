import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, Image, StyleSheet,
  Platform, ActivityIndicator, ScrollView, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import Toast from 'react-native-toast-message';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useBugReport } from '@/contexts/BugReportContext';
import { submitBugReport, type SubmitResult } from '@/lib/bug-report-client';

const TITLE_MAX = 100;
const DESC_MAX = 500;

function getDeviceInfo() {
  if (Platform.OS === 'web') return null;
  return {
    model: Constants.deviceName ?? 'unknown',
    os: Platform.OS,
    os_version: String(Platform.Version),
  };
}

function mapError(r: SubmitResult): string | null {
  switch (r.kind) {
    case 'ok': return null;
    case 'rate_limited': return "You've submitted a lot of reports in a short time. Please try again later.";
    case 'validation_error': return `That submission was rejected (${r.field}). Try rephrasing.`;
    case 'payload_too_large': return 'Screenshot is too large — try submitting without it.';
    case 'unauthenticated': return 'Please sign in and try again.';
    case 'network_error':
    case 'server_error':
    default:
      return 'Something went wrong submitting. Please try again.';
  }
}

export function BugReportModal() {
  const { visible, screenshotBase64, closeBugReport } = useBugReport();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const pathname = usePathname();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachScreenshot, setAttachScreenshot] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitting;

  const reset = useCallback(() => {
    setTitle('');
    setDescription('');
    setAttachScreenshot(true);
    setSubmitting(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    // Dismiss the keyboard before unmounting the modal — without this on iOS
    // the keyboard stays visible briefly and intercepts touches on the
    // underlying screen, making the app feel frozen.
    Keyboard.dismiss();
    reset();
    closeBugReport();
  }, [reset, closeBugReport]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setSubmitting(true);
    setError(null);
    const result = await submitBugReport({
      title: title.trim(),
      description: description.trim(),
      screenshot_base64: attachScreenshot ? screenshotBase64 : null,
      platform: Platform.OS === 'web' ? 'web' : 'ios',
      app_version: Constants.expoConfig?.version ?? '0.0.0',
      route: pathname || '/',
      device: getDeviceInfo(),
    });
    if (result.kind === 'ok') {
      Toast.show({ type: 'success', text1: 'Thanks! Report submitted.' });
      handleClose();
      return;
    }
    setError(mapError(result));
    setSubmitting(false);
  }, [canSubmit, title, description, attachScreenshot, screenshotBase64, pathname, handleClose]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable onPress={handleClose}><Text style={styles.cancel}>Cancel</Text></Pressable>
            <Text style={styles.title}>Report a Bug</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {screenshotBase64 && (
              <Image
                source={{ uri: `data:image/png;base64,${screenshotBase64}` }}
                style={styles.screenshotPreview}
                resizeMode="contain"
              />
            )}

            {screenshotBase64 && (
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Attach Screenshot?</Text>
                <ToggleSwitch value={attachScreenshot} onValueChange={setAttachScreenshot} />
              </View>
            )}

            <Text style={styles.label}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Brief summary"
              placeholderTextColor={colors.textTertiary}
              maxLength={TITLE_MAX}
              style={styles.input}
            />
            <Text style={styles.counter}>{title.length}/{TITLE_MAX}</Text>

            <Text style={styles.label}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What went wrong? What were you doing?"
              placeholderTextColor={colors.textTertiary}
              maxLength={DESC_MAX}
              multiline
              numberOfLines={6}
              style={[styles.input, styles.textarea]}
            />
            <Text style={styles.counter}>{description.length}/{DESC_MAX}</Text>

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              accessibilityState={{ disabled: !canSubmit }}
              accessibilityRole="button"
            >
              {submitting
                ? <ActivityIndicator color="white" />
                : <Text style={styles.submitText}>Submit a Ticket</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(colors: typeof Colors.light) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: BorderRadius.lg,
      borderTopRightRadius: BorderRadius.lg,
      maxHeight: '90%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: Spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    cancel: { ...Typography.body.base, color: colors.tint, width: 60 },
    title: { ...Typography.display.h3, color: colors.text },
    body: { padding: Spacing.md, gap: Spacing.sm },
    screenshotPreview: {
      width: '100%',
      height: 200,
      borderRadius: BorderRadius.sm,
      backgroundColor: colors.backgroundSecondary,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginVertical: Spacing.sm,
    },
    toggleLabel: { ...Typography.body.base, color: colors.text },
    label: { ...Typography.body.smMedium, color: colors.text, marginTop: Spacing.sm },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.sm,
      padding: Spacing.sm,
      color: colors.text,
    },
    textarea: { minHeight: 120, textAlignVertical: 'top' },
    counter: { ...Typography.body.xs, color: colors.textTertiary, textAlign: 'right' },
    error: { ...Typography.body.xs, color: colors.error, marginTop: Spacing.sm },
    submit: {
      backgroundColor: colors.tint,
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      marginTop: Spacing.md,
    },
    submitDisabled: { opacity: 0.5 },
    submitText: { ...Typography.button.primary, color: 'white' },
  });
}
