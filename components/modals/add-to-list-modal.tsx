/**
 * Add to List Modal Component
 * Slide-up modal for saving a movie to user's lists
 * Reference: ui-mocks/add_to_list_modal.html
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Modal,
  ScrollView,
} from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { Ionicons } from '@expo/vector-icons';

interface List {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
}

interface AddToListModalProps {
  /**
   * Whether the modal is visible
   */
  visible: boolean;

  /**
   * Callback when modal is closed
   */
  onClose: () => void;

  /**
   * Callback when list selection is confirmed
   */
  onSave: (selectedListIds: string[]) => void;

  /**
   * Callback when "Create New List" is tapped
   */
  onCreateNewList: () => void;

  /**
   * Movie data to display in the modal
   */
  movie: {
    id: string;
    title: string;
    year: string;
    posterUrl: string;
  };

  /**
   * User's lists
   */
  lists: List[];

  /**
   * IDs of lists that already contain this movie
   */
  initialSelectedListIds?: string[];
}

/**
 * AddToListModal component for saving movies to user lists
 *
 * Features:
 * - Slide-up modal animation from bottom
 * - Movie mini header (poster + title + year)
 * - Scrollable list of user's lists with checkboxes
 * - Multi-select support
 * - List icons and item counts
 * - Create New List button
 * - Done button to confirm selection
 * - Backdrop blur effect
 *
 * @example
 * <AddToListModal
 *   visible={isVisible}
 *   onClose={() => setIsVisible(false)}
 *   onSave={(listIds) => console.log(listIds)}
 *   onCreateNewList={() => console.log('Create new list')}
 *   movie={{ id: '1', title: 'Dune: Part Two', year: '2024', posterUrl: '...' }}
 *   lists={[
 *     { id: '1', name: 'Watchlist', icon: 'bookmark-outline' },
 *     { id: '2', name: 'Favorites', icon: 'heart-outline' },
 *     { id: '3', name: 'Sci-Fi Masterpieces', icon: 'list-outline', count: 12 },
 *   ]}
 *   initialSelectedListIds={['1']}
 * />
 */
export function AddToListModal({
  visible,
  onClose,
  onSave,
  onCreateNewList,
  movie,
  lists,
  initialSelectedListIds = [],
}: AddToListModalProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const [selectedListIds, setSelectedListIds] = useState<string[]>(initialSelectedListIds);

  const toggleList = (listId: string) => {
    setSelectedListIds((prev) =>
      prev.includes(listId)
        ? prev.filter((id) => id !== listId)
        : [...prev, listId]
    );
  };

  const handleDone = () => {
    onSave(selectedListIds);
    onClose();
  };

  const handleClose = () => {
    // Reset selection to initial state
    setSelectedListIds(initialSelectedListIds);
    onClose();
  };

  const handleCreateNewList = () => {
    onCreateNewList();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <Pressable
        style={styles.overlay}
        onPress={handleClose}
      >
        {/* Modal Content - prevent backdrop press from closing when tapping inside */}
        <Pressable
          style={[styles.modalContent, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header: Title | Done */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text
              style={[
                Typography.body.sm,
                {
                  color: colors.textSecondary,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                },
              ]}
            >
              Save to List
            </Text>
            <Pressable
              onPress={handleDone}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={[Typography.body.sm, { color: colors.textSecondary, fontWeight: '600' }]}>
                Done
              </Text>
            </Pressable>
          </View>

          {/* Movie Mini Header */}
          <View style={styles.movieHeader}>
            <Image
              source={{ uri: movie.posterUrl }}
              style={styles.poster}
            />
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '700' }]}>
                {movie.title}
              </Text>
              <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>
                {movie.year}
              </Text>
            </View>
          </View>

          {/* Scrollable List Options */}
          <ScrollView
            style={styles.listContainer}
            showsVerticalScrollIndicator={false}
          >
            {lists.map((list) => {
              const isSelected = selectedListIds.includes(list.id);
              return (
                <Pressable
                  key={list.id}
                  style={[styles.listOption, { borderBottomColor: colors.border }]}
                  onPress={() => toggleList(list.id)}
                >
                  <View style={styles.listInfo}>
                    <View style={[styles.iconContainer, { backgroundColor: colors.backgroundSecondary }]}>
                      <Ionicons
                        name={list.icon}
                        size={16}
                        color={colors.text}
                      />
                    </View>
                    <View style={styles.listText}>
                      <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>
                        {list.name}
                      </Text>
                      {list.count !== undefined && (
                        <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>
                          {list.count} movies
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Checkbox */}
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: isSelected ? colors.tint : colors.textSecondary,
                        backgroundColor: isSelected ? colors.tint : 'transparent',
                      },
                    ]}
                  >
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color="#fff"
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Create New List Button */}
          <Pressable
            style={styles.createListButton}
            onPress={handleCreateNewList}
          >
            <Ionicons
              name="add"
              size={20}
              color={colors.tint}
            />
            <Text style={[Typography.body.base, { color: colors.tint, fontWeight: '600' }]}>
              Create New List
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
  },
  movieHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  poster: {
    width: 40,
    height: 60,
    borderRadius: 4,
  },
  listContainer: {
    flex: 1,
  },
  listOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  listInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  iconContainer: {
    padding: 8,
    borderRadius: 50,
  },
  listText: {
    flexDirection: 'column',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
  },
});
