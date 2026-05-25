import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/lib/theme-context';
import { hapticImpact } from '@/lib/haptics';
import { analytics } from '@/lib/analytics';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ContentContainer } from '@/components/content-container';
import { formatRelativeTime } from '@/lib/utils';
import {
  pickFeedbackScreenshot,
  uploadFeedbackScreenshot,
  type FeedbackImagePickerResult,
  type FeedbackStatus,
  type FeedbackType,
} from '@/lib/feedback/feedback-service';
import { useMyFeedback, useSubmitFeedback } from '@/lib/feedback/use-feedback';

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 1000;

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'feature_request', label: 'Feature request' },
  { value: 'feedback', label: 'General feedback' },
];

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

export default function FeedbackScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { user } = useAuth();

  if (!user) {
    return <GuestGate colors={colors} />;
  }

  return <FeedbackForm colors={colors} userId={user.id} effectiveTheme={effectiveTheme} />;
}

// ---------------------------------------------------------------------------
// Guest gate
// ---------------------------------------------------------------------------

function GuestGate({ colors }: { colors: typeof Colors.dark }) {
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ContentContainer>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            accessibilityLabel="Go back"
          >
            <ChevronLeftIcon color={colors.text} />
          </Pressable>
          <Text style={[Typography.display.h4, { color: colors.text }]}>
            Feedback & Feature Requests
          </Text>
        </View>

        <View style={styles.guestContainer}>
          <Ionicons name="chatbubbles-outline" size={56} color={colors.textSecondary} />
          <Text
            style={[
              Typography.display.h4,
              { color: colors.text, marginTop: Spacing.md, textAlign: 'center' },
            ]}
          >
            Sign in to send feedback
          </Text>
          <Text
            style={[
              Typography.body.base,
              {
                color: colors.textSecondary,
                marginTop: Spacing.sm,
                textAlign: 'center',
                maxWidth: 320,
              },
            ]}
          >
            Sign in to share a feature request or send us a note. We read every one.
          </Text>

          <Pressable
            onPress={() => router.push('/(auth)/signin')}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={[Typography.body.base, { color: 'white', fontWeight: '600' }]}>Sign in</Text>
          </Pressable>
        </View>
      </ContentContainer>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

interface FeedbackFormProps {
  colors: typeof Colors.dark;
  userId: string;
  effectiveTheme: 'light' | 'dark';
}

function FeedbackForm({ colors, userId, effectiveTheme }: FeedbackFormProps) {
  const [type, setType] = useState<FeedbackType>('feature_request');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<FeedbackImagePickerResult | null>(null);
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);
  const [submittedRow, setSubmittedRow] = useState<{ title: string } | null>(null);
  const [submissionsExpanded, setSubmissionsExpanded] = useState(true);

  const submitMutation = useSubmitFeedback();
  const { data: mySubmissions, isLoading: isLoadingSubmissions } = useMyFeedback();

  // Screen-view event — fires once on mount. Tracked only for the form path
  // (signed-in users); the GuestGate is rendered separately and intentionally
  // does not log a view event.
  useEffect(() => {
    analytics.track('feedback:screen_viewed');
  }, []);

  const titleTrimmedLen = title.trim().length;
  const descriptionTrimmedLen = description.trim().length;
  const isFormValid =
    titleTrimmedLen > 0 &&
    descriptionTrimmedLen > 0 &&
    title.length <= TITLE_MAX &&
    description.length <= DESCRIPTION_MAX;
  const isSubmitting = submitMutation.isPending || isUploadingScreenshot;

  const appVersion = Constants.expoConfig?.version ?? '';
  const platform: string = Platform.OS;

  const handleAttachScreenshot = async () => {
    hapticImpact();
    try {
      const picked = await pickFeedbackScreenshot();
      if (picked) {
        setScreenshot(picked);
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: "Couldn't open photo picker",
        visibilityTime: 3000,
      });
    }
  };

  const handleRemoveScreenshot = () => {
    hapticImpact();
    setScreenshot(null);
  };

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) return;
    hapticImpact();

    let screenshotPath: string | null = null;
    if (screenshot) {
      setIsUploadingScreenshot(true);
      const upload = await uploadFeedbackScreenshot(userId, screenshot.uri, screenshot.type);
      setIsUploadingScreenshot(false);
      if (!upload.success || !upload.path) {
        Toast.show({
          type: 'error',
          text1: "Couldn't upload screenshot",
          text2: upload.error ?? 'Please try again or submit without an image.',
          visibilityTime: 4000,
        });
        return;
      }
      screenshotPath = upload.path;
    }

    try {
      const row = await submitMutation.mutateAsync({
        type,
        title,
        description,
        screenshotUrl: screenshotPath,
        appVersion,
        platform,
      });
      analytics.track('feedback:submitted', {
        type,
        has_screenshot: !!screenshotPath,
        title_length: title.trim().length,
        description_length: description.trim().length,
      });
      setSubmittedRow({ title: row.title });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      // Map known RPC errors to a stable code dimension. The rate-limit error
      // is raised with a specific copy in submit_feature_request (see migration
      // 20260524234228_create_feature_requests). Anything else is bucketed
      // under 'unknown' so we can still spot regressions in PostHog.
      const errorCode = /5 submissions in 24 hours/i.test(message)
        ? 'rate_limit'
        : 'unknown';
      analytics.track('feedback:submit_failed', {
        type,
        error_code: errorCode,
      });
      Toast.show({
        type: 'error',
        text1: "Couldn't send feedback",
        text2: message,
        visibilityTime: 5000,
      });
    }
  };

  const handleSubmitAnother = () => {
    setType('feature_request');
    setTitle('');
    setDescription('');
    setScreenshot(null);
    setSubmittedRow(null);
  };

  const titleOverLimit = title.length > TITLE_MAX;
  const descriptionOverLimit = description.length > DESCRIPTION_MAX;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <ContentContainer>
            <View style={styles.header}>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                accessibilityLabel="Go back"
              >
                <ChevronLeftIcon color={colors.text} />
              </Pressable>
              <Text style={[Typography.display.h4, { color: colors.text }]}>
                Feedback & Feature Requests
              </Text>
            </View>

            {submittedRow ? (
              <SuccessState
                colors={colors}
                title={submittedRow.title}
                onSubmitAnother={handleSubmitAnother}
              />
            ) : (
              <View style={styles.form}>
                {/* Type segmented control */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>Type</Text>
                <TypeSegmented value={type} onChange={setType} effectiveTheme={effectiveTheme} />

                {/* Title */}
                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 0 }]}>
                      Title
                    </Text>
                    <Text
                      style={[
                        Typography.body.xs,
                        { color: titleOverLimit ? colors.error : colors.textTertiary },
                      ]}
                    >
                      {title.length}/{TITLE_MAX}
                    </Text>
                  </View>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.card,
                        color: colors.text,
                        borderColor: titleOverLimit ? colors.error : 'transparent',
                      },
                    ]}
                    placeholder="Short summary"
                    placeholderTextColor={colors.textTertiary}
                    value={title}
                    onChangeText={setTitle}
                    maxLength={TITLE_MAX}
                    accessibilityLabel="Title"
                  />
                </View>

                {/* Description */}
                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 0 }]}>
                      Description
                    </Text>
                    <Text
                      style={[
                        Typography.body.xs,
                        { color: descriptionOverLimit ? colors.error : colors.textTertiary },
                      ]}
                    >
                      {description.length}/{DESCRIPTION_MAX}
                    </Text>
                  </View>
                  <TextInput
                    style={[
                      styles.input,
                      styles.textArea,
                      {
                        backgroundColor: colors.card,
                        color: colors.text,
                        borderColor: descriptionOverLimit ? colors.error : 'transparent',
                      },
                    ]}
                    placeholder="Tell us what you'd like to see, or what went well or poorly."
                    placeholderTextColor={colors.textTertiary}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    maxLength={DESCRIPTION_MAX}
                    accessibilityLabel="Description"
                  />
                </View>

                {/* Screenshot */}
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>
                    Screenshot (optional)
                  </Text>
                  <View
                    style={[
                      styles.warningBox,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <Ionicons name="warning-outline" size={18} color={colors.gold} />
                    <Text
                      style={[
                        Typography.body.sm,
                        { color: colors.textSecondary, flex: 1, marginLeft: Spacing.sm },
                      ]}
                    >
                      Don&apos;t include sensitive info — anyone on our team can see this.
                    </Text>
                  </View>

                  {screenshot ? (
                    <View style={styles.thumbnailRow}>
                      <Image
                        source={{ uri: screenshot.uri }}
                        style={styles.thumbnail}
                        accessibilityLabel="Attached screenshot preview"
                      />
                      <Pressable
                        onPress={handleRemoveScreenshot}
                        style={({ pressed }) => [
                          styles.removeButton,
                          { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Remove screenshot"
                      >
                        <Ionicons name="close" size={20} color={colors.text} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={handleAttachScreenshot}
                      style={({ pressed }) => [
                        styles.attachButton,
                        { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Attach a screenshot"
                    >
                      <Ionicons name="image-outline" size={20} color={colors.text} />
                      <Text
                        style={[
                          Typography.body.base,
                          { color: colors.text, fontWeight: '600', marginLeft: Spacing.sm },
                        ]}
                      >
                        Attach a screenshot
                      </Text>
                    </Pressable>
                  )}
                </View>

                {/* Submit */}
                <Pressable
                  onPress={handleSubmit}
                  disabled={!isFormValid || isSubmitting}
                  style={({ pressed }) => [
                    styles.submitButton,
                    {
                      backgroundColor:
                        isFormValid && !isSubmitting ? colors.tint : colors.card,
                      opacity: pressed && isFormValid ? 0.85 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Submit feedback"
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text
                      style={[
                        Typography.body.base,
                        {
                          color: isFormValid ? 'white' : colors.textTertiary,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      Submit
                    </Text>
                  )}
                </Pressable>
              </View>
            )}

            {/* My submissions */}
            <View style={styles.section}>
              <Pressable
                onPress={() => setSubmissionsExpanded((prev) => !prev)}
                style={({ pressed }) => [
                  styles.sectionHeaderRow,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ expanded: submissionsExpanded }}
                accessibilityLabel="My submissions"
              >
                <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
                  MY SUBMISSIONS
                </Text>
                <Ionicons
                  name={submissionsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>

              {submissionsExpanded && (
                <SubmissionsList
                  colors={colors}
                  rows={mySubmissions ?? []}
                  isLoading={isLoadingSubmissions}
                />
              )}
            </View>
          </ContentContainer>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Success state
// ---------------------------------------------------------------------------

interface SuccessStateProps {
  colors: typeof Colors.dark;
  title: string;
  onSubmitAnother: () => void;
}

function SuccessState({ colors, onSubmitAnother }: SuccessStateProps) {
  return (
    <View style={styles.successContainer}>
      <View
        style={[styles.successCircle, { backgroundColor: colors.accentSecondary }]}
        accessibilityElementsHidden
      >
        <Ionicons name="checkmark" size={48} color="white" />
      </View>
      <Text
        style={[
          Typography.display.h4,
          { color: colors.text, marginTop: Spacing.lg, textAlign: 'center' },
        ]}
      >
        Thanks — we read every one.
      </Text>
      <Text
        style={[
          Typography.body.base,
          {
            color: colors.textSecondary,
            marginTop: Spacing.sm,
            textAlign: 'center',
            maxWidth: 320,
          },
        ]}
      >
        Your submission is in. You can track it below.
      </Text>
      <Pressable
        onPress={onSubmitAnother}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Submit another"
      >
        <Text style={[Typography.body.base, { color: 'white', fontWeight: '600' }]}>
          Submit another
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Type segmented control
// ---------------------------------------------------------------------------

interface TypeSegmentedProps {
  value: FeedbackType;
  onChange: (next: FeedbackType) => void;
  effectiveTheme: 'light' | 'dark';
}

function TypeSegmented({ value, onChange, effectiveTheme }: TypeSegmentedProps) {
  const colors = Colors[effectiveTheme];
  const trackBackground =
    effectiveTheme === 'dark' ? colors.background : colors.backgroundSecondary;

  return (
    <View style={[segmentedStyles.track, { backgroundColor: trackBackground }]}>
      {TYPE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              hapticImpact();
              onChange(opt.value);
            }}
            style={({ pressed }) => [
              segmentedStyles.option,
              selected && { backgroundColor: colors.card },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.label}
          >
            <Text
              style={[
                Typography.body.sm,
                {
                  color: selected ? colors.tint : colors.textSecondary,
                  fontWeight: selected ? '700' : '500',
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Submissions list
// ---------------------------------------------------------------------------

interface SubmissionsListProps {
  colors: typeof Colors.dark;
  rows: { id: string; title: string; type: string; status: string; created_at: string | null }[];
  isLoading: boolean;
}

function SubmissionsList({ colors, rows, isLoading }: SubmissionsListProps) {
  if (isLoading) {
    return (
      <View style={styles.submissionsEmpty}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View
        style={[styles.submissionsEmpty, { backgroundColor: colors.card }]}
      >
        <Text
          style={[
            Typography.body.sm,
            { color: colors.textSecondary, textAlign: 'center' },
          ]}
        >
          Your submissions will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {rows.map((row, idx) => (
        <SubmissionRow
          key={row.id}
          row={row}
          colors={colors}
          isFirst={idx === 0}
          isLast={idx === rows.length - 1}
        />
      ))}
    </View>
  );
}

interface SubmissionRowProps {
  row: { id: string; title: string; type: string; status: string; created_at: string | null };
  colors: typeof Colors.dark;
  isFirst: boolean;
  isLast: boolean;
}

function SubmissionRow({ row, colors, isFirst, isLast }: SubmissionRowProps) {
  const typeLabel = row.type === 'feature_request' ? 'Feature request' : 'General feedback';
  const relative = useMemo(
    () => (row.created_at ? formatRelativeTime(row.created_at) : ''),
    [row.created_at],
  );

  return (
    <View
      style={[
        styles.submissionRow,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : 1,
        },
        isFirst && {
          borderTopLeftRadius: BorderRadius.md,
          borderTopRightRadius: BorderRadius.md,
        },
        isLast && {
          borderBottomLeftRadius: BorderRadius.md,
          borderBottomRightRadius: BorderRadius.md,
        },
      ]}
    >
      <View style={styles.submissionTopRow}>
        <Text
          style={[Typography.body.base, { color: colors.text, fontWeight: '600', flex: 1 }]}
          numberOfLines={2}
        >
          {row.title}
        </Text>
        <StatusPill status={row.status as FeedbackStatus} colors={colors} />
      </View>
      <View style={styles.submissionBottomRow}>
        <View style={[styles.typePill, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[Typography.body.xs, { color: colors.textSecondary, fontWeight: '600' }]}>
            {typeLabel}
          </Text>
        </View>
        {relative ? (
          <Text style={[Typography.body.xs, { color: colors.textTertiary }]}>{relative}</Text>
        ) : null}
      </View>
    </View>
  );
}

interface StatusPillProps {
  status: FeedbackStatus;
  colors: typeof Colors.dark;
}

function StatusPill({ status, colors }: StatusPillProps) {
  const { bg, fg, label } = useMemo(() => {
    switch (status) {
      case 'triaged':
        return { bg: 'rgba(0, 191, 255, 0.15)', fg: colors.blue, label: 'Triaged' };
      case 'planned':
        return { bg: 'rgba(251, 191, 36, 0.15)', fg: colors.gold, label: 'Planned' };
      case 'shipped':
        return { bg: 'rgba(16, 185, 129, 0.15)', fg: colors.accentSecondary, label: 'Shipped' };
      case 'declined':
        return { bg: colors.backgroundSecondary, fg: colors.textTertiary, label: 'Declined' };
      case 'new':
      default:
        return { bg: colors.backgroundSecondary, fg: colors.textSecondary, label: 'New' };
    }
  }, [status, colors]);

  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      <Text style={[Typography.body.xs, { color: fg, fontWeight: '700' }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'web' ? Spacing.md : undefined,
  },
  form: {
    paddingHorizontal: Spacing.md,
    ...(Platform.OS === 'web' ? { maxWidth: 500, width: '100%', alignSelf: 'center' as const } : {}),
  },
  field: {
    marginTop: Spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  input: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: 16,
    borderWidth: 2,
  },
  textArea: {
    minHeight: 140,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  thumbnailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.sm,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  primaryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    minWidth: 200,
  },
  guestContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    alignItems: 'center',
  },
  successContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    alignItems: 'center',
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  submissionRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  submissionTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  submissionBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  typePill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  submissionsEmpty: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const segmentedStyles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 3,
    gap: 2,
  },
  option: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
  },
});
