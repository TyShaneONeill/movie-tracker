/**
 * Create List Modal Component
 * Centered modal for creating a new list
 * Reference: ui-mocks/create_list_modal.html
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { Ionicons } from '@expo/vector-icons';

interface CreateListModalProps {
  /**
   * Whether the modal is visible
   */
  visible: boolean;

  /**
   * Callback when modal is closed
   */
  onClose: () => void;

  /**
   * Callback when list is created
   */
  onCreate: (listData: ListData) => void;
}

interface ListData {
  name: string;
  description: string;
  isPublic: boolean;
}

/**
 * CreateListModal component for creating new movie lists
 *
 * Features:
 * - Centered modal card with backdrop blur
 * - Close button (X) in header
 * - Name text input (required)
 * - Description textarea (optional)
 * - Privacy selector with lock icon and chevron
 * - Create List button (primary style)
 * - Form validation (name required)
 *
 * @example
 * <CreateListModal
 *   visible={isVisible}
 *   onClose={() => setIsVisible(false)}
 *   onCreate={(data) => console.log(data)}
 * />
 */
export function CreateListModal({
  visible,
  onClose,
  onCreate,
}: CreateListModalProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  const handleCreate = () => {
    if (!name.trim()) {
      return; // Don't create if name is empty
    }

    const listData: ListData = {
      name: name.trim(),
      description: description.trim(),
      isPublic,
    };
    onCreate(listData);
    handleClose();
  };

  const handleClose = () => {
    // Reset form
    setName('');
    setDescription('');
    setIsPublic(true);
    onClose();
  };

  const togglePrivacy = () => {
    setIsPublic(!isPublic);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Backdrop */}
        <Pressable
          style={styles.overlay}
          onPress={handleClose}
        >
          {/* Modal Card - prevent backdrop press from closing when tapping inside */}
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header with close button */}
            <View style={styles.header}>
              <Text style={[Typography.display.h4, { color: colors.text }]}>
                Create New List
              </Text>
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Name Input */}
              <View style={styles.inputGroup}>
                <Text style={[Typography.body.sm, styles.inputLabel, { color: colors.textSecondary }]}>
                  Name
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.backgroundSecondary,
                      color: colors.text,
                      borderColor: 'transparent',
                    },
                    Typography.body.base,
                  ]}
                  placeholder="e.g. Scariest Movies Ever"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoFocus
                />
              </View>

              {/* Description Input */}
              <View style={styles.inputGroup}>
                <Text style={[Typography.body.sm, styles.inputLabel, { color: colors.textSecondary }]}>
                  Description (Optional)
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    styles.textArea,
                    {
                      backgroundColor: colors.backgroundSecondary,
                      color: colors.text,
                      borderColor: 'transparent',
                    },
                    Typography.body.base,
                  ]}
                  placeholder="What's this list about?"
                  placeholderTextColor={colors.textSecondary}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              {/* Privacy Selector */}
              <View style={styles.inputGroup}>
                <Text style={[Typography.body.sm, styles.inputLabel, { color: colors.textSecondary }]}>
                  Privacy
                </Text>
                <Pressable
                  style={[
                    styles.privacyRow,
                    { backgroundColor: colors.backgroundSecondary },
                  ]}
                  onPress={togglePrivacy}
                >
                  <Ionicons
                    name={isPublic ? 'lock-open-outline' : 'lock-closed-outline'}
                    size={20}
                    color={colors.text}
                  />
                  <Text style={[Typography.body.base, styles.privacyText, { color: colors.text }]}>
                    {isPublic ? 'Public' : 'Private'}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>

              {/* Create Button */}
              <Pressable
                style={[
                  styles.createButton,
                  {
                    backgroundColor: colors.tint,
                    opacity: name.trim() ? 1 : 0.5,
                  },
                ]}
                onPress={handleCreate}
                disabled={!name.trim()}
              >
                <Text style={[Typography.body.base, { color: '#fff', fontWeight: '600' }]}>
                  Create List
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    marginBottom: 8,
  },
  textInput: {
    width: '100%',
    borderRadius: BorderRadius.md,
    padding: 12,
    borderWidth: 1,
  },
  textArea: {
    height: 100,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: 12,
    borderRadius: BorderRadius.md,
  },
  privacyText: {
    flex: 1,
  },
  createButton: {
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
});
