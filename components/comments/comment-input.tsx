import React, { useState, useRef, useMemo } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';

interface CommentInputProps {
  onSubmit: (body: string, isSpoiler: boolean) => Promise<void>;
  isSubmitting?: boolean;
  replyingTo?: string | null;
  onCancelReply?: () => void;
  placeholder?: string;
}

const MAX_LENGTH = 500;

export function CommentInput({
  onSubmit,
  isSubmitting = false,
  replyingTo,
  onCancelReply,
  placeholder = 'Add a comment...',
}: CommentInputProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [text, setText] = useState('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const trimmed = text.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= MAX_LENGTH && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit(trimmed, isSpoiler);
    setText('');
    setIsSpoiler(false);
    inputRef.current?.blur();
  };

  return (
    <View style={styles.container}>
      {/* Reply indicator */}
      {replyingTo && (
        <View style={styles.replyBar}>
          <Text style={styles.replyText} numberOfLines={1}>
            Replying to @{replyingTo}
          </Text>
          <Pressable onPress={onCancelReply} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}

      <View style={styles.inputRow}>
        {/* Spoiler toggle */}
        <Pressable
          onPress={() => setIsSpoiler(!isSpoiler)}
          hitSlop={8}
          style={styles.spoilerToggle}
          accessibilityLabel={isSpoiler ? 'Remove spoiler flag' : 'Mark as spoiler'}
        >
          <Ionicons
            name={isSpoiler ? 'eye-off' : 'eye-off-outline'}
            size={20}
            color={isSpoiler ? '#D97706' : colors.textTertiary}
          />
        </Pressable>

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={replyingTo ? `Reply to @${replyingTo}...` : placeholder}
          placeholderTextColor={colors.textTertiary}
          maxLength={MAX_LENGTH}
          multiline
          editable={!isSubmitting}
        />

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          hitSlop={8}
          style={[styles.sendButton, !canSubmit && styles.sendButtonDisabled]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <Ionicons
              name="send"
              size={20}
              color={canSubmit ? colors.tint : colors.textTertiary}
            />
          )}
        </Pressable>
      </View>

      {/* Character count */}
      {trimmed.length > 400 && (
        <Text
          style={[
            styles.charCount,
            trimmed.length > MAX_LENGTH && { color: colors.error },
          ]}
        >
          {trimmed.length}/{MAX_LENGTH}
        </Text>
      )}
    </View>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      backgroundColor: colors.background,
    },
    replyBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.xs,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.sm,
    },
    replyText: {
      ...Typography.body.xs,
      color: colors.textSecondary,
      flex: 1,
      marginRight: Spacing.sm,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    spoilerToggle: {
    },
    input: {
      ...Typography.body.sm,
      color: colors.text,
      flex: 1,
      maxHeight: 100,
      paddingVertical: 4,
    },
    sendButton: {
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    charCount: {
      ...Typography.body.xs,
      color: colors.textTertiary,
      textAlign: 'right',
      marginTop: 2,
    },
  });
}

export default CommentInput;
