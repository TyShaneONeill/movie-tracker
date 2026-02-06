/**
 * Edit Journey Screen
 * Modal screen for editing journey details when users tap the edit button on a Journey Card.
 *
 * Sections:
 * 1. MEMORIES - Photo upload placeholder (Phase 1: Coming Soon)
 * 2. DETAILS - Tagline, rating slider (read-only First Take), notes
 * 3. LOGISTICS - Date, time, location, seat, format, auditorium, price, ticket ID
 * 4. WHO WAS THERE - Friend chips with add/remove
 * 5. DELETE JOURNEY - Confirmation alert before deleting
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useJourneyMutations } from '@/hooks/use-journey';

// Watch format options for dropdown
const WATCH_FORMATS = [
  'Standard',
  'IMAX',
  'Dolby',
  '3D',
  '4K',
  'ScreenX',
  '4DX',
] as const;

type WatchFormat = (typeof WATCH_FORMATS)[number];

// Journey data type (matching database schema expectations)
interface JourneyData {
  id: string;
  tmdb_id: number;
  movie_title: string;
  journey_tagline: string | null;
  journey_notes: string | null;
  watched_at: string | null;
  watch_time: string | null;
  location_name: string | null;
  seat_location: string | null;
  watch_format: string | null;
  auditorium: string | null;
  ticket_price: number | null;
  ticket_id: string | null;
  watched_with: string[] | null;
  // First Take data (read-only reference)
  first_take_rating: number | null;
}

// Mock journey data for Phase 1 (until hook is implemented)
const getMockJourneyData = (id: string): JourneyData => ({
  id,
  tmdb_id: 693134,
  movie_title: 'Dune: Part Two',
  journey_tagline: 'Masterpiece',
  journey_notes: 'The visuals were absolutely insane. Needs to be seen on the biggest screen possible.',
  watched_at: '2024-03-01T00:00:00Z',
  watch_time: '19:00',
  location_name: 'IMAX Metreon',
  seat_location: 'H-12, H-13',
  watch_format: 'IMAX',
  auditorium: 'Theater 4',
  ticket_price: 18.50,
  ticket_id: '8X92-MM24',
  watched_with: ['Sarah'],
  first_take_rating: 9.2,
});

export default function EditJourneyScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  // Mock data loading (will be replaced with useJourneyMutations hook)
  const [isLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Use the journey mutations hook for delete
  const { deleteJourney, isDeleting } = useJourneyMutations();

  // Initialize form with mock data
  const initialData = useMemo(() => getMockJourneyData(id || ''), [id]);

  // Form state
  const [tagline, setTagline] = useState(initialData.journey_tagline || '');
  const [notes, setNotes] = useState(initialData.journey_notes || '');
  const [rating, setRating] = useState(initialData.first_take_rating || 5);
  const [watchedAt, setWatchedAt] = useState<Date>(
    initialData.watched_at ? new Date(initialData.watched_at) : new Date()
  );
  const [watchTime, setWatchTime] = useState<Date>(() => {
    if (initialData.watch_time) {
      const [hours, minutes] = initialData.watch_time.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return date;
    }
    return new Date();
  });
  const [locationName, setLocationName] = useState(initialData.location_name || '');
  const [seatLocation, setSeatLocation] = useState(initialData.seat_location || '');
  const [watchFormat, setWatchFormat] = useState<WatchFormat>(
    (initialData.watch_format as WatchFormat) || 'Standard'
  );
  const [auditorium, setAuditorium] = useState(initialData.auditorium || '');
  const [ticketPrice, setTicketPrice] = useState(
    initialData.ticket_price?.toString() || ''
  );
  const [ticketId, setTicketId] = useState(initialData.ticket_id || '');
  const [watchedWith, setWatchedWith] = useState<string[]>(
    initialData.watched_with || []
  );

  // Format picker visibility
  const [showFormatPicker, setShowFormatPicker] = useState(false);

  // Add friend modal state
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [newFriendName, setNewFriendName] = useState('');

  // Create dynamic styles
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Format rating display (show decimal only when needed)
  const formatRating = (value: number) => {
    return value % 1 === 0 ? value.toString() : value.toFixed(1);
  };

  // Handle cancel
  const handleCancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  // Handle save
  const handleSave = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsUpdating(true);

    const journeyData = {
      journey_tagline: tagline.trim() || null,
      journey_notes: notes.trim() || null,
      watched_at: watchedAt.toISOString(),
      watch_time: `${watchTime.getHours().toString().padStart(2, '0')}:${watchTime.getMinutes().toString().padStart(2, '0')}`,
      location_name: locationName.trim() || null,
      seat_location: seatLocation.trim() || null,
      watch_format: watchFormat,
      auditorium: auditorium.trim() || null,
      ticket_price: ticketPrice ? parseFloat(ticketPrice) : null,
      ticket_id: ticketId.trim() || null,
      watched_with: watchedWith.length > 0 ? watchedWith : null,
    };

    // Log data for Phase 1 (will be replaced with actual mutation)
    console.log('Saving journey data:', journeyData);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));

    setIsUpdating(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Show toast before navigation so user sees it
    const isNewJourney = id === 'new';
    Toast.show({
      type: 'success',
      text1: isNewJourney ? 'Journey created' : 'Journey updated',
      visibilityTime: 2000,
    });

    // Navigate back
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [
    id,
    tagline,
    notes,
    watchedAt,
    watchTime,
    locationName,
    seatLocation,
    watchFormat,
    auditorium,
    ticketPrice,
    ticketId,
    watchedWith,
    router,
  ]);

  // Handle delete
  const handleDelete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Delete Journey',
      'Are you sure you want to delete this journey? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteJourney(id as string);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              // Show toast before navigation so user sees it
              Toast.show({
                type: 'info',
                text1: 'Journey deleted',
                visibilityTime: 2000,
              });
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            } catch (error) {
              console.error('Failed to delete journey:', error);
              Alert.alert('Error', 'Failed to delete journey. Please try again.');
            }
          },
        },
      ]
    );
  }, [id, router, deleteJourney]);

  // Handle add friend (using modal for cross-platform support)
  const handleAddFriend = useCallback(() => {
    setNewFriendName('');
    setShowAddFriendModal(true);
  }, []);

  // Confirm add friend
  const handleConfirmAddFriend = useCallback(() => {
    if (newFriendName.trim()) {
      setWatchedWith((prev) => [...prev, newFriendName.trim()]);
    }
    setShowAddFriendModal(false);
    setNewFriendName('');
  }, [newFriendName]);

  // Cancel add friend
  const handleCancelAddFriend = useCallback(() => {
    setShowAddFriendModal(false);
    setNewFriendName('');
  }, []);

  // Handle remove friend
  const handleRemoveFriend = useCallback((index: number) => {
    setWatchedWith((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Handle format selection
  const handleFormatSelect = useCallback((format: WatchFormat) => {
    setWatchFormat(format);
    setShowFormatPicker(false);
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={styles.loadingText}>Loading journey...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleCancel}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.headerButtonPressed,
            ]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>

          <Text style={styles.headerTitle}>Edit Journey</Text>

          <Pressable
            onPress={handleSave}
            disabled={isUpdating}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.headerButtonPressed,
            ]}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* MEMORIES Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MEMORIES</Text>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionSubtitle}>
                Add photos of your ticket, poster, or friends. First photo will be the cover.
              </Text>
              <View style={styles.memoriesPlaceholder}>
                <View style={styles.comingSoonBadge}>
                  <Svg
                    width={24}
                    height={24}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={colors.textTertiary}
                    strokeWidth={1.5}
                  >
                    <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <Path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                  </Svg>
                  <Text style={styles.comingSoonText}>Photo Upload Coming Soon</Text>
                </View>
              </View>
            </View>
          </View>

          {/* DETAILS Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DETAILS</Text>
            <View style={styles.sectionCard}>
              {/* Tagline Input */}
              <Text style={styles.inputLabel}>Tagline</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Masterpiece, Fun time..."
                placeholderTextColor={colors.textTertiary}
                value={tagline}
                onChangeText={setTagline}
                maxLength={50}
              />

              {/* Rating Display (Read-only for Phase 1) */}
              <Text style={[styles.inputLabel, styles.inputLabelSpaced]}>
                Rating (from First Take)
              </Text>
              <View style={styles.ratingWrapper}>
                <View style={styles.ratingDisplay}>
                  <Text style={styles.ratingValue}>{formatRating(rating)}</Text>
                  <Text style={styles.ratingMax}>/ 10</Text>
                </View>
                <View style={styles.sliderContainer}>
                  <Slider
                    style={styles.slider}
                    minimumValue={1}
                    maximumValue={10}
                    step={0.1}
                    value={rating}
                    onValueChange={setRating}
                    minimumTrackTintColor={colors.tint}
                    maximumTrackTintColor={colors.backgroundSecondary}
                    thumbTintColor="#ffffff"
                  />
                </View>
                <View style={styles.ratingLabels}>
                  <Text style={[styles.ratingLabelText, styles.ratingLabelLeft]}>Poor</Text>
                  <Text style={[styles.ratingLabelText, styles.ratingLabelCenter]}>Average</Text>
                  <Text style={[styles.ratingLabelText, styles.ratingLabelRight]}>Masterpiece</Text>
                </View>
              </View>

              {/* Notes Input */}
              <Text style={[styles.inputLabel, styles.inputLabelSpaced]}>Notes</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Your thoughts about this viewing experience..."
                placeholderTextColor={colors.textTertiary}
                value={notes}
                onChangeText={setNotes}
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
            </View>
          </View>

          {/* LOGISTICS Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LOGISTICS</Text>
            <View style={styles.sectionCard}>
              {/* Date & Time Row - Text inputs for Phase 1 */}
              <View style={styles.row}>
                <View style={styles.halfColumn}>
                  <Text style={styles.inputLabel}>Date</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="MM/DD/YYYY"
                    placeholderTextColor={colors.textTertiary}
                    value={formatDateForInput(watchedAt)}
                    onChangeText={(text) => {
                      const parsed = parseDateInput(text);
                      if (parsed) setWatchedAt(parsed);
                    }}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={styles.halfColumn}>
                  <Text style={styles.inputLabel}>Time</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="7:00 PM"
                    placeholderTextColor={colors.textTertiary}
                    value={formatTimeForInput(watchTime)}
                    onChangeText={(text) => {
                      const parsed = parseTimeInput(text);
                      if (parsed) setWatchTime(parsed);
                    }}
                  />
                </View>
              </View>

              {/* Location Input */}
              <Text style={[styles.inputLabel, styles.inputLabelSpaced]}>Location</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Theater name, Home, etc."
                placeholderTextColor={colors.textTertiary}
                value={locationName}
                onChangeText={setLocationName}
              />

              {/* Seat & Format Row */}
              <View style={[styles.row, styles.rowSpaced]}>
                <View style={styles.halfColumn}>
                  <Text style={styles.inputLabel}>Seat</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. H-12"
                    placeholderTextColor={colors.textTertiary}
                    value={seatLocation}
                    onChangeText={setSeatLocation}
                  />
                </View>
                <View style={styles.halfColumn}>
                  <Text style={styles.inputLabel}>Format</Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.pickerButton,
                      pressed && styles.pickerButtonPressed,
                    ]}
                    onPress={() => setShowFormatPicker(!showFormatPicker)}
                  >
                    <Text style={styles.pickerButtonText}>{watchFormat}</Text>
                    <Text style={styles.dropdownIcon}>
                      {showFormatPicker ? '\u25B2' : '\u25BC'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Format Dropdown */}
              {showFormatPicker && (
                <View style={styles.formatDropdown}>
                  {WATCH_FORMATS.map((format) => (
                    <Pressable
                      key={format}
                      style={({ pressed }) => [
                        styles.formatOption,
                        watchFormat === format && styles.formatOptionSelected,
                        pressed && styles.formatOptionPressed,
                      ]}
                      onPress={() => handleFormatSelect(format)}
                    >
                      <Text
                        style={[
                          styles.formatOptionText,
                          watchFormat === format && styles.formatOptionTextSelected,
                        ]}
                      >
                        {format}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Auditorium & Price Row */}
              <View style={[styles.row, styles.rowSpaced]}>
                <View style={styles.halfColumn}>
                  <Text style={styles.inputLabel}>Auditorium</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Theater 4"
                    placeholderTextColor={colors.textTertiary}
                    value={auditorium}
                    onChangeText={setAuditorium}
                  />
                </View>
                <View style={styles.halfColumn}>
                  <Text style={styles.inputLabel}>Ticket Price</Text>
                  <View style={styles.priceInputWrapper}>
                    <Text style={styles.pricePrefix}>$</Text>
                    <TextInput
                      style={[styles.textInput, styles.priceInput]}
                      placeholder="0.00"
                      placeholderTextColor={colors.textTertiary}
                      value={ticketPrice}
                      onChangeText={(text) => {
                        // Allow only numbers and decimal
                        const cleaned = text.replace(/[^0-9.]/g, '');
                        // Prevent multiple decimals
                        const parts = cleaned.split('.');
                        if (parts.length > 2) return;
                        // Limit decimal places to 2
                        if (parts[1] && parts[1].length > 2) return;
                        setTicketPrice(cleaned);
                      }}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>

              {/* Ticket ID Input */}
              <Text style={[styles.inputLabel, styles.inputLabelSpaced]}>Ticket ID</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 8X92-MM24"
                placeholderTextColor={colors.textTertiary}
                value={ticketId}
                onChangeText={setTicketId}
                autoCapitalize="characters"
              />
            </View>
          </View>

          {/* WHO WAS THERE Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>WHO WAS THERE?</Text>
            <View style={styles.sectionCard}>
              <View style={styles.friendsContainer}>
                {watchedWith.length === 0 && (
                  <Text style={styles.soloViewingText}>Solo viewing</Text>
                )}
                {watchedWith.map((friend, index) => (
                  <View key={index} style={styles.friendChip}>
                    <Text style={styles.friendChipText}>{friend}</Text>
                    <Pressable
                      onPress={() => handleRemoveFriend(index)}
                      style={({ pressed }) => [
                        styles.friendChipRemove,
                        pressed && styles.friendChipRemovePressed,
                      ]}
                    >
                      <Text style={styles.friendChipRemoveText}>X</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={handleAddFriend}
                  style={({ pressed }) => [
                    styles.addFriendButton,
                    pressed && styles.addFriendButtonPressed,
                  ]}
                >
                  <Text style={styles.addFriendButtonText}>+ Add Friend</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* DELETE JOURNEY Button */}
          <Pressable
            onPress={handleDelete}
            disabled={isDeleting}
            style={({ pressed }) => [
              styles.deleteButton,
              pressed && styles.deleteButtonPressed,
              isDeleting && styles.deleteButtonDisabled,
            ]}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <Text style={styles.deleteButtonText}>Delete Journey</Text>
            )}
          </Pressable>

          {/* Bottom spacing */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Add Friend Modal */}
        <Modal
          visible={showAddFriendModal}
          transparent
          animationType="fade"
          onRequestClose={handleCancelAddFriend}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add Friend</Text>
              <Text style={styles.modalSubtitle}>
                Enter the name of who you watched with:
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Friend's name"
                placeholderTextColor={colors.textTertiary}
                value={newFriendName}
                onChangeText={setNewFriendName}
                autoFocus
                onSubmitEditing={handleConfirmAddFriend}
              />
              <View style={styles.modalButtons}>
                <Pressable
                  onPress={handleCancelAddFriend}
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalButtonCancel,
                    pressed && styles.modalButtonPressed,
                  ]}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirmAddFriend}
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalButtonConfirm,
                    pressed && styles.modalButtonPressed,
                  ]}
                >
                  <Text style={styles.modalButtonConfirmText}>Add</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Helper: Format date for input display
function formatDateForInput(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

// Helper: Format time for input display
function formatTimeForInput(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

// Helper: Parse date input text
function parseDateInput(text: string): Date | null {
  // Try MM/DD/YYYY format
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const month = parseInt(match[1], 10) - 1;
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
}

// Helper: Parse time input text
function parseTimeInput(text: string): Date | null {
  // Try H:MM AM/PM format
  const match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3]?.toUpperCase();

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  }
  return null;
}

// Type for colors object
type ThemeColors = typeof Colors.dark;

// Create styles function that takes theme colors
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      ...Typography.body.base,
      color: colors.textSecondary,
      marginTop: Spacing.md,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    headerButton: {
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.sm,
      minWidth: 60,
    },
    headerButtonPressed: {
      opacity: 0.7,
    },
    headerTitle: {
      ...Typography.display.h4,
      color: colors.text,
    },
    cancelButtonText: {
      ...Typography.body.base,
      color: colors.textSecondary,
    },
    saveButtonText: {
      ...Typography.body.baseMedium,
      color: colors.tint,
      textAlign: 'right',
    },

    // ScrollView
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: Spacing.md,
    },

    // Section
    section: {
      marginBottom: Spacing.lg,
    },
    sectionTitle: {
      ...Typography.body.xs,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontFamily: Fonts.inter.semibold,
      marginBottom: Spacing.sm,
    },
    sectionCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
    },
    sectionSubtitle: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginBottom: Spacing.md,
    },

    // Memories placeholder
    memoriesPlaceholder: {
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: BorderRadius.md,
      padding: Spacing.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    comingSoonBadge: {
      alignItems: 'center',
      gap: Spacing.sm,
    },
    comingSoonText: {
      ...Typography.body.sm,
      color: colors.textTertiary,
    },

    // Input styles
    inputLabel: {
      ...Typography.body.xs,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontFamily: Fonts.inter.medium,
      marginBottom: Spacing.xs,
    },
    inputLabelSpaced: {
      marginTop: Spacing.md,
    },
    textInput: {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.sm,
      padding: Spacing.sm,
      color: colors.text,
      ...Typography.body.base,
    },
    textArea: {
      height: 100,
      textAlignVertical: 'top',
    },

    // Rating styles
    ratingWrapper: {
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    ratingDisplay: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    ratingValue: {
      fontFamily: Fonts.outfit.extrabold,
      fontSize: 48,
      color: colors.tint,
      lineHeight: 52,
    },
    ratingMax: {
      fontFamily: Fonts.outfit.semibold,
      fontSize: 20,
      color: colors.textTertiary,
    },
    sliderContainer: {
      width: '100%',
      height: 32,
      justifyContent: 'center',
    },
    slider: {
      width: '100%',
      height: 32,
    },
    ratingLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      marginTop: -Spacing.xs,
      paddingHorizontal: Platform.OS === 'ios' ? 16 : 0,
    },
    ratingLabelText: {
      ...Typography.body.xs,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontFamily: Fonts.inter.semibold,
      flex: 1,
    },
    ratingLabelLeft: {
      textAlign: 'left',
    },
    ratingLabelCenter: {
      textAlign: 'center',
    },
    ratingLabelRight: {
      textAlign: 'right',
    },

    // Row styles
    row: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    rowSpaced: {
      marginTop: Spacing.md,
    },
    halfColumn: {
      flex: 1,
    },

    // Picker button styles
    pickerButton: {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.sm,
      padding: Spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pickerButtonPressed: {
      opacity: 0.7,
    },
    pickerButtonText: {
      ...Typography.body.base,
      color: colors.text,
    },
    dropdownIcon: {
      color: colors.textSecondary,
      fontSize: 10,
    },

    // Format dropdown
    formatDropdown: {
      marginTop: Spacing.sm,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.sm,
      overflow: 'hidden',
    },
    formatOption: {
      padding: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    formatOptionSelected: {
      backgroundColor: colors.tint + '20',
    },
    formatOptionPressed: {
      opacity: 0.7,
    },
    formatOptionText: {
      ...Typography.body.base,
      color: colors.text,
    },
    formatOptionTextSelected: {
      color: colors.tint,
      fontFamily: Fonts.inter.medium,
    },

    // Price input
    priceInputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.sm,
    },
    pricePrefix: {
      ...Typography.body.base,
      color: colors.textSecondary,
      paddingLeft: Spacing.sm,
    },
    priceInput: {
      flex: 1,
      borderWidth: 0,
      backgroundColor: 'transparent',
    },

    // Friends section
    friendsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      alignItems: 'center',
    },
    soloViewingText: {
      ...Typography.body.sm,
      color: colors.textTertiary,
      fontStyle: 'italic',
    },
    friendChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.xs,
      paddingLeft: Spacing.md,
      paddingRight: Spacing.xs,
      gap: Spacing.xs,
    },
    friendChipText: {
      ...Typography.body.sm,
      color: colors.text,
    },
    friendChipRemove: {
      width: 24,
      height: 24,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    friendChipRemovePressed: {
      opacity: 0.7,
    },
    friendChipRemoveText: {
      ...Typography.body.xs,
      color: colors.textSecondary,
      fontFamily: Fonts.inter.semibold,
    },
    addFriendButton: {
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.full,
      borderStyle: 'dashed',
    },
    addFriendButtonPressed: {
      opacity: 0.7,
    },
    addFriendButtonText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },

    // Delete button
    deleteButton: {
      borderWidth: 1,
      borderColor: colors.tint,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Spacing.md,
    },
    deleteButtonPressed: {
      backgroundColor: colors.tint + '10',
    },
    deleteButtonDisabled: {
      opacity: 0.5,
    },
    deleteButtonText: {
      ...Typography.button.primary,
      color: colors.tint,
    },

    // Bottom spacer for safe scrolling
    bottomSpacer: {
      height: Spacing.xl,
    },

    // Add Friend Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.lg,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      width: '100%',
      maxWidth: 340,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalTitle: {
      ...Typography.display.h4,
      color: colors.text,
      textAlign: 'center',
      marginBottom: Spacing.xs,
    },
    modalSubtitle: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Spacing.md,
    },
    modalInput: {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.sm,
      padding: Spacing.sm,
      color: colors.text,
      ...Typography.body.base,
      marginBottom: Spacing.md,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    modalButton: {
      flex: 1,
      padding: Spacing.sm,
      borderRadius: BorderRadius.sm,
      alignItems: 'center',
    },
    modalButtonCancel: {
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalButtonConfirm: {
      backgroundColor: colors.tint,
    },
    modalButtonPressed: {
      opacity: 0.7,
    },
    modalButtonCancelText: {
      ...Typography.button.secondary,
      color: colors.textSecondary,
    },
    modalButtonConfirmText: {
      ...Typography.button.primary,
      color: '#ffffff',
    },
  });
