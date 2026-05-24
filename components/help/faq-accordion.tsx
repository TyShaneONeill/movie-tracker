import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ThemedText } from '@/components/themed-text';
import type { FaqEntry } from '@/lib/help/faq';

interface FaqAccordionProps {
  entries: FaqEntry[];
}

interface FaqRowProps {
  entry: FaqEntry;
  isFirst: boolean;
  isLast: boolean;
}

function FaqRow({ entry, isFirst, isLast }: FaqRowProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [expanded, setExpanded] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    Animated.timing(rotation, {
      toValue: next ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  const paragraphs = entry.answer.split('\n\n');

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderBottomColor: colors.border },
        isFirst && styles.firstRow,
        isLast && styles.lastRow,
        isLast && { borderBottomWidth: 0 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={entry.question}
        onPress={toggle}
        style={({ pressed }) => [
          styles.questionRow,
          pressed && { backgroundColor: colors.backgroundSecondary },
        ]}
      >
        <ThemedText style={[Typography.body.base, styles.questionText, { color: colors.text }]}>
          {entry.question}
        </ThemedText>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Animated.View>
      </Pressable>
      {expanded && (
        <View style={styles.answerWrapper}>
          {paragraphs.map((para, idx) => (
            <ThemedText
              key={idx}
              style={[
                Typography.body.base,
                styles.answerText,
                { color: colors.textSecondary },
                idx > 0 && { marginTop: Spacing.sm },
              ]}
            >
              {para}
            </ThemedText>
          ))}
        </View>
      )}
    </View>
  );
}

export function FaqAccordion({ entries }: FaqAccordionProps) {
  return (
    <View>
      {entries.map((entry, idx) => (
        <FaqRow
          key={entry.id}
          entry={entry}
          isFirst={idx === 0}
          isLast={idx === entries.length - 1}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderBottomWidth: 1,
  },
  firstRow: {
    borderTopLeftRadius: BorderRadius.md,
    borderTopRightRadius: BorderRadius.md,
  },
  lastRow: {
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
  },
  questionRow: {
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  questionText: {
    flex: 1,
    fontWeight: '600',
  },
  answerWrapper: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  answerText: {
    lineHeight: 22,
  },
});
