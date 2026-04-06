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

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  Keyboard,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { hapticImpact, hapticNotification, NotificationFeedbackType } from '@/lib/haptics';
import Toast from 'react-native-toast-message';

import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { Image } from 'expo-image';
import { useTheme } from '@/lib/theme-context';
import { useJourney, useJourneyMutations, useJourneysByMovie, useCreateJourney } from '@/hooks/use-journey';
import type { WatchFormat as DbWatchFormat } from '@/lib/database.types';
import { useAuth } from '@/hooks/use-auth';
import { useMutualFollows } from '@/hooks/use-mutual-follows';
import { buildAvatarUrl } from '@/lib/avatar-service';
import { FriendPickerModal } from '@/components/social/friend-picker-modal';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { pickImage } from '@/lib/image-utils';
import { usePremium } from '@/lib/premium-context';
import { captureException } from '@/lib/sentry';

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

// Convert DB watch_format (lowercase) to display format
function toDisplayFormat(dbFormat: string | null): WatchFormat {
  if (!dbFormat) return 'Standard';
  const match = WATCH_FORMATS.find((f) => f.toLowerCase() === dbFormat.toLowerCase());
  return match || 'Standard';
}

export default function EditJourneyScreen() {
  const router = useRouter();
  const { id, tmdbId: tmdbIdParam } = useLocalSearchParams<{ id: string; tmdbId?: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { user } = useAuth();
  const { mutualFollows } = useMutualFollows(user?.id ?? '');
  const { tier } = usePremium();

  // Create mode: id === 'new' with tmdbId query param
  const isCreateMode = id === 'new';
  const parsedTmdbId = tmdbIdParam ? parseInt(tmdbIdParam, 10) : undefined;

  // Fetch real journey data (edit mode only)
  const { data: journeyData, isLoading: isLoadingJourney } = useJourney(isCreateMode ? undefined : id);

  // Journey mutations (update + delete)
  const tmdbId = isCreateMode ? parsedTmdbId : journeyData?.tmdb_id;

  // Fetch all journeys for this movie — used for metadata template (create mode)
  // and to determine if this is the last journey before confirming delete (edit mode)
  const { data: movieJourneys } = useJourneysByMovie(tmdbId);
  const { createJourney } = useCreateJourney();
  const { updateJourney: updateJourneyMutation, isUpdating, deleteJourney, isDeleting } =
    useJourneyMutations(tmdbId);

  // Form state (initialized with defaults, populated via useEffect when data loads)
  const [tagline, setTagline] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(5);
  const [watchedAt, setWatchedAt] = useState<Date>(new Date());
  const [watchTime, setWatchTime] = useState<Date>(new Date());
  const [locationName, setLocationName] = useState('');
  const [seatLocation, setSeatLocation] = useState('');
  const [watchFormat, setWatchFormat] = useState<WatchFormat>('Standard');
  const [auditorium, setAuditorium] = useState('');
  const [ticketPrice, setTicketPrice] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [watchedWith, setWatchedWith] = useState<string[]>([]);

  // Photo management state
  const [localPhotos, setLocalPhotos] = useState<string[]>([]);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [aiPosterDeleted, setAiPosterDeleted] = useState(false);

  // TextInput refs for keyboard navigation
  const taglineRef = useRef<TextInput>(null);
  const locationRef = useRef<TextInput>(null);
  const seatRef = useRef<TextInput>(null);
  const auditoriumRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);
  const ticketIdRef = useRef<TextInput>(null);

  // Populate form state when journey data loads
  useEffect(() => {
    if (!journeyData) return;
    setTagline(journeyData.journey_tagline || '');
    setNotes(journeyData.journey_notes || '');
    setRating(journeyData.firstTake?.rating || 5);
    setWatchedAt(journeyData.watched_at ? new Date(journeyData.watched_at) : new Date());
    setWatchTime(() => {
      if (journeyData.watch_time) {
        const [hours, minutes] = journeyData.watch_time.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date;
      }
      return new Date();
    });
    setLocationName(journeyData.location_name || '');
    setSeatLocation(journeyData.seat_location || '');
    setWatchFormat(toDisplayFormat(journeyData.watch_format));
    setAuditorium(journeyData.auditorium || '');
    setTicketPrice(journeyData.ticket_price?.toString() || '');
    setTicketId(journeyData.ticket_id || '');
    setWatchedWith(journeyData.watched_with || []);
    setLocalPhotos(journeyData.journey_photos ?? []);
    setAiPosterDeleted(false);
  }, [journeyData]);

  // Format picker visibility
  const [showFormatPicker, setShowFormatPicker] = useState(false);

  // Friend picker modal state
  const [showFriendPicker, setShowFriendPicker] = useState(false);

  // Build a name → avatar URL lookup from mutual follows
  const friendAvatarMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const p of mutualFollows) {
      const name = (p.full_name || p.username || '').toLowerCase();
      if (name) map.set(name, buildAvatarUrl(p.avatar_url, p.updated_at));
    }
    return map;
  }, [mutualFollows]);

  // Create dynamic styles
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Format rating display (show decimal only when needed)
  const formatRating = (value: number) => {
    return value % 1 === 0 ? value.toString() : value.toFixed(1);
  };

  // Handle add photo
  const handleAddPhoto = useCallback(async () => {
    const result = await pickImage();
    if (!result) return;

    setIsUploading(true);
    try {
      const fileName = `${user?.id}/${id}/${Date.now()}.jpg`;

      // Convert URI to ArrayBuffer — native needs FileSystem (blob.arrayBuffer() not available in RN)
      let uploadBody: ArrayBuffer;
      if (Platform.OS === 'web') {
        const response = await fetch(result.uri);
        uploadBody = await response.arrayBuffer();
      } else {
        const base64 = await FileSystem.readAsStringAsync(result.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        uploadBody = bytes.buffer;
      }

      const { error } = await supabase.storage
        .from('journey-photos')
        .upload(fileName, uploadBody, { contentType: 'image/jpeg', cacheControl: '86400', upsert: false });

      if (error) {
        console.error('[journey-photo] upload error:', error.message);
        captureException(new Error(error.message), { context: 'journey-photo-upload' });
        Toast.show({ type: 'error', text1: 'Upload failed', text2: error.message, visibilityTime: 3000 });
        return;
      }

      const { data } = supabase.storage.from('journey-photos').getPublicUrl(fileName);
      setLocalPhotos((prev) => [...prev, data.publicUrl]);
    } catch (err) {
      console.error('[journey-photo] unexpected error:', err);
      captureException(err instanceof Error ? err : new Error(String(err)), { context: 'journey-photo-upload' });
      Toast.show({ type: 'error', text1: 'Upload failed', text2: 'Please try again', visibilityTime: 3000 });
    } finally {
      setIsUploading(false);
    }
  }, [user?.id, id]);

  // Handle delete photo (optimistic — URL removed from local state immediately)
  const handleDeletePhoto = useCallback((photoUrl: string) => {
    setLocalPhotos((prev) => prev.filter((url) => url !== photoUrl));
    const path = photoUrl.split('/journey-photos/')[1];
    if (path) {
      supabase.storage.from('journey-photos').remove([path]).catch(() => {});
    }
  }, []);

  // Handle cancel
  const handleCancel = useCallback(() => {
    hapticImpact();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  // Build form data for save
  const buildFormData = useCallback(() => ({
    journey_tagline: tagline.trim() || null,
    journey_notes: notes.trim() || null,
    watched_at: watchedAt.toISOString(),
    watch_time: `${watchTime.getHours().toString().padStart(2, '0')}:${watchTime.getMinutes().toString().padStart(2, '0')}`,
    location_name: locationName.trim() || null,
    seat_location: seatLocation.trim() || null,
    watch_format: watchFormat.toLowerCase() as DbWatchFormat,
    auditorium: auditorium.trim() || null,
    ticket_price: ticketPrice ? parseFloat(ticketPrice) : null,
    ticket_id: ticketId.trim() || null,
    watched_with: watchedWith.length > 0 ? watchedWith : null,
    journey_photos: localPhotos.length > 0 ? localPhotos : null,
    ...(aiPosterDeleted ? { ai_poster_url: null, ai_poster_rarity: null, display_poster: 'original' as const } : {}),
  }), [tagline, notes, watchedAt, watchTime, locationName, seatLocation, watchFormat, auditorium, ticketPrice, ticketId, watchedWith, localPhotos, aiPosterDeleted]);

  // Handle save
  const handleSave = useCallback(async () => {
    hapticImpact();
    const formData = buildFormData();

    try {
      if (isCreateMode) {
        // Create mode: create the journey first, then set form data
        const templateJourney = movieJourneys?.journeys[0];
        if (!templateJourney) return;
        const newJourney = await createJourney(templateJourney);
        await updateJourneyMutation({ journeyId: newJourney.id, data: formData });
      } else {
        if (!id) return;
        await updateJourneyMutation({ journeyId: id, data: formData });
      }

      hapticNotification(NotificationFeedbackType.Success);
      Toast.show({
        type: 'success',
        text1: isCreateMode ? 'Journey created' : 'Journey updated',
        visibilityTime: 2000,
      });

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Failed to save',
        text2: 'Please try again',
        visibilityTime: 3000,
      });
    }
  }, [
    id,
    isCreateMode,
    buildFormData,
    createJourney,
    movieJourneys,
    updateJourneyMutation,
    router,
  ]);

  // Handle delete
  const handleDelete = useCallback(() => {
    hapticNotification(NotificationFeedbackType.Warning);
    const isLastJourney = (movieJourneys?.journeys.length ?? 1) <= 1;
    const title = isLastJourney ? 'Remove from Collection' : 'Delete Journey';
    const message = isLastJourney
      ? `This is your only record of watching this movie. Deleting it will remove the movie from your collection entirely.`
      : 'Delete this viewing? Your other journey records for this movie will remain.';
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteJourney(id as string);
              hapticNotification(NotificationFeedbackType.Success);
              Toast.show({
                type: 'info',
                text1: isLastJourney ? 'Removed from collection' : 'Journey deleted',
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
  }, [id, router, deleteJourney, movieJourneys]);

  // Handle add friend
  const handleAddFriend = useCallback(() => {
    Keyboard.dismiss();
    setShowFriendPicker(true);
  }, []);

  const handleFriendSelected = useCallback((displayName: string) => {
    setWatchedWith((prev) => [...prev, displayName]);
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

  if (!isCreateMode && isLoadingJourney) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={styles.loadingText}>Loading journey...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isCreateMode && !isLoadingJourney && !journeyData) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Journey not found</Text>
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

          <Text style={styles.headerTitle}>{isCreateMode ? 'New Journey' : 'Edit Journey'}</Text>

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
          keyboardDismissMode="on-drag"
        >
          {/* MEMORIES Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MEMORIES</Text>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionSubtitle}>
                Add photos of your ticket, poster, or friends. First photo will be the cover.
              </Text>

              {/* Photo grid */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoRow}
              >
                {/* Journey photos */}
                {localPhotos.map((photoUrl) => (
                  <View key={photoUrl} style={styles.photoTile}>
                    <Image
                      source={{ uri: photoUrl }}
                      style={styles.photoTileImage}
                      contentFit="cover"
                      transition={200}
                    />
                    {isDeleteMode && (
                      <Pressable
                        style={styles.photoDeleteBadge}
                        onPress={() => handleDeletePhoto(photoUrl)}
                      >
                        <Text style={styles.photoDeleteX}>✕</Text>
                      </Pressable>
                    )}
                  </View>
                ))}

                {/* AI poster tile */}
                {!aiPosterDeleted && journeyData?.ai_poster_url && (
                  <View style={styles.photoTile}>
                    <Image
                      source={{ uri: journeyData.ai_poster_url }}
                      style={styles.photoTileImage}
                      contentFit="cover"
                      transition={200}
                    />
                    <View style={styles.aiPosterBadge}>
                      <Text style={styles.aiPosterBadgeText}>AI ✨</Text>
                    </View>
                    {isDeleteMode && tier === 'dev' && (
                      <Pressable
                        style={styles.photoDeleteBadge}
                        onPress={() => setAiPosterDeleted(true)}
                      >
                        <Text style={styles.photoDeleteX}>✕</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* Add photo tile — hidden in delete mode */}
                {!isDeleteMode && (
                  <Pressable
                    style={styles.addPhotoTile}
                    onPress={handleAddPhoto}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <ActivityIndicator size="small" color={colors.textTertiary} />
                    ) : (
                      <Text style={styles.addPhotoIcon}>+</Text>
                    )}
                  </Pressable>
                )}
              </ScrollView>

              {/* Edit Photos toggle */}
              <Pressable
                style={styles.editPhotosButton}
                onPress={() => setIsDeleteMode((prev) => !prev)}
              >
                <Text style={styles.editPhotosButtonText}>
                  {isDeleteMode ? 'Done' : 'Edit Photos'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* DETAILS Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DETAILS</Text>
            <View style={styles.sectionCard}>
              {/* Tagline Input */}
              <Text style={styles.inputLabel}>Tagline</Text>
              <TextInput
                ref={taglineRef}
                style={styles.textInput}
                placeholder="e.g. Masterpiece, Fun time..."
                placeholderTextColor={colors.textTertiary}
                value={tagline}
                onChangeText={setTagline}
                maxLength={50}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => locationRef.current?.focus()}
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
                ref={locationRef}
                style={styles.textInput}
                placeholder="Theater name, Home, etc."
                placeholderTextColor={colors.textTertiary}
                value={locationName}
                onChangeText={setLocationName}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => seatRef.current?.focus()}
              />

              {/* Seat & Format Row */}
              <View style={[styles.row, styles.rowSpaced]}>
                <View style={styles.halfColumn}>
                  <Text style={styles.inputLabel}>Seat</Text>
                  <TextInput
                    ref={seatRef}
                    style={styles.textInput}
                    placeholder="e.g. H-12"
                    placeholderTextColor={colors.textTertiary}
                    value={seatLocation}
                    onChangeText={setSeatLocation}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => auditoriumRef.current?.focus()}
                  />
                </View>
                <View style={styles.halfColumn}>
                  <Text style={styles.inputLabel}>Format</Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.pickerButton,
                      pressed && styles.pickerButtonPressed,
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowFormatPicker(!showFormatPicker);
                    }}
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
                    ref={auditoriumRef}
                    style={styles.textInput}
                    placeholder="e.g. Theater 4"
                    placeholderTextColor={colors.textTertiary}
                    value={auditorium}
                    onChangeText={setAuditorium}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => priceRef.current?.focus()}
                  />
                </View>
                <View style={styles.halfColumn}>
                  <Text style={styles.inputLabel}>Ticket Price</Text>
                  <View style={styles.priceInputWrapper}>
                    <Text style={styles.pricePrefix}>$</Text>
                    <TextInput
                      ref={priceRef}
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
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => ticketIdRef.current?.focus()}
                    />
                  </View>
                </View>
              </View>

              {/* Ticket ID Input */}
              <Text style={[styles.inputLabel, styles.inputLabelSpaced]}>Ticket ID</Text>
              <TextInput
                ref={ticketIdRef}
                style={styles.textInput}
                placeholder="e.g. 8X92-MM24"
                placeholderTextColor={colors.textTertiary}
                value={ticketId}
                onChangeText={setTicketId}
                autoCapitalize="characters"
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={() => Keyboard.dismiss()}
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
                {watchedWith.map((friend, index) => {
                  const avatarUrl = friendAvatarMap.get(friend.toLowerCase());
                  return (
                  <View key={index} style={styles.friendChip}>
                    {avatarUrl ? (
                      <Image
                        source={{ uri: avatarUrl }}
                        style={styles.friendChipAvatar}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : null}
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
                  );
                })}
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

          {/* DELETE JOURNEY Button (edit mode only) */}
          {!isCreateMode && (
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
          )}

          {/* Bottom spacing */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Friend Picker Modal */}
        <FriendPickerModal
          visible={showFriendPicker}
          onClose={() => setShowFriendPicker(false)}
          onSelectFriend={handleFriendSelected}
          alreadyAdded={watchedWith}
        />
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

    // Photo grid
    photoRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingBottom: Spacing.xs,
    },
    photoTile: {
      width: 100,
      height: 140,
      borderRadius: 8,
      overflow: 'hidden',
      position: 'relative',
    },
    photoTileImage: {
      width: 100,
      height: 140,
    },
    photoDeleteBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.tint,
      justifyContent: 'center',
      alignItems: 'center',
    },
    photoDeleteX: {
      color: '#fff',
      fontSize: 12,
      fontFamily: Fonts.inter.semibold,
      lineHeight: 14,
    },
    aiPosterBadge: {
      position: 'absolute',
      bottom: 6,
      left: 6,
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    aiPosterBadgeText: {
      color: '#fff',
      fontSize: 10,
      fontFamily: Fonts.inter.semibold,
    },
    addPhotoTile: {
      width: 100,
      height: 140,
      borderRadius: 8,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.textTertiary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    addPhotoIcon: {
      fontSize: 28,
      color: colors.textTertiary,
      lineHeight: 32,
    },
    editPhotosButton: {
      marginTop: Spacing.sm,
      alignSelf: 'flex-end',
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.sm,
    },
    editPhotosButtonText: {
      ...Typography.body.sm,
      color: colors.tint,
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
      paddingLeft: Spacing.xs,
      paddingRight: Spacing.xs,
      gap: Spacing.xs,
    },
    friendChipAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
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

  });
