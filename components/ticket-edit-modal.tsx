/**
 * Ticket Edit Modal Component
 *
 * Bottom sheet modal for editing ticket details.
 * Uses @gorhom/bottom-sheet for smooth gestures.
 * Matches ui-mocks/ticket_review.html modal styling.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  Platform,
} from 'react-native';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import type { ProcessedTicket, TMDBMatch } from '@/lib/ticket-processor';
import type { TMDBMovie } from '@/lib/tmdb.types';
import { useMovieSearch } from '@/hooks/use-movie-search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { TicketMovieSearchResult } from './ticket-movie-search-result';
import { DatePickerField } from './DatePickerField';
import { TimePickerField } from './TimePickerField';

// ============================================================================
// Types
// ============================================================================

export interface TicketEditModalProps {
  visible: boolean;
  ticket: ProcessedTicket | null;
  onClose: () => void;
  onSave: (updatedTicket: ProcessedTicket) => void;
}

interface FormData {
  movieTitle: string;
  theater: string;
  date: string;
  time: string;
  row: string;
  seat: string;
  format: string;
  price: string;
  auditorium: string;
  rating: string;
  ticketType: string;
}

// ============================================================================
// Constants
// ============================================================================

const FORMAT_OPTIONS = [
  'Standard',
  'IMAX',
  'Dolby Cinema',
  '3D',
  'IMAX 3D',
  '4DX',
  'ScreenX',
  'RPX',
  'XD',
  'Premium',
];

const MPAA_RATING_OPTIONS = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'];

const TICKET_TYPE_OPTIONS = ['Adult', 'Child', 'Senior', 'Student', 'Matinee', 'Other'];

// ============================================================================
// Component
// ============================================================================

// Use BottomSheetTextInput on Android for proper keyboard handling inside bottom sheets
const FormTextInput = Platform.OS === 'android' ? BottomSheetTextInput : TextInput;

export function TicketEditModal({
  visible,
  ticket,
  onClose,
  onSave,
}: TicketEditModalProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);

  // TextInput refs for keyboard navigation
  // Typed as `any` to bridge react-native TextInput and BottomSheetTextInput (android) ref incompatibility
  const theaterRef = useRef<any>(null);
  const auditoriumRef = useRef<any>(null);
  const rowRef = useRef<any>(null);
  const seatRef = useRef<any>(null);
  const priceRef = useRef<any>(null);

  // Keyboard scroll — manual avoidance (keyboardBehavior is unreliable inside RN Modal)
  const scrollRef = useRef<any>(null);
  const kbHeightRef = useRef(0);
  const [kbHeight, setKbHeight] = useState(0);
  const focusedFieldKey = useRef<string | null>(null);
  const formOffset = useRef(0);
  const rowOffsets = useRef<Record<string, number>>({});

  // Form state
  const [formData, setFormData] = useState<FormData>({
    movieTitle: '',
    theater: '',
    date: '',
    time: '',
    row: '',
    seat: '',
    format: 'Standard',
    price: '',
    auditorium: '',
    rating: '',
    ticketType: '',
  });

  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [showRatingPicker, setShowRatingPicker] = useState(false);
  const [showTicketTypePicker, setShowTicketTypePicker] = useState(false);

  // Movie search state
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<TMDBMovie | null>(null);

  // Movie search hooks
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const { movies, isLoading } = useMovieSearch({
    query: debouncedSearchQuery,
    enabled: isSearchMode && debouncedSearchQuery.length >= 2,
  });

  // Snap points for the bottom sheet
  const snapPoints = useMemo(() => ['85%'], []);

  // Initialize form data when ticket changes
  useEffect(() => {
    if (ticket) {
      // Format price with currency symbol
      const priceDisplay = ticket.priceAmount
        ? `${ticket.priceCurrency === 'USD' ? '$' : ticket.priceCurrency}${ticket.priceAmount.toFixed(2)}`
        : '';

      setFormData({
        movieTitle: ticket.tmdbMatch?.movie.title || ticket.movieTitle || '',
        theater: ticket.theaterName || '',
        date: ticket.date || '',
        time: ticket.showtime || '',
        row: ticket.seatRow || '',
        seat: ticket.seatNumber || '',
        format: ticket.format || 'Standard',
        price: priceDisplay,
        auditorium: ticket.auditorium || '',
        rating: ticket.mpaaRating || '',
        ticketType: ticket.ticketType || '',
      });

      // Reset search state when modal opens with new ticket
      setIsSearchMode(false);
      setSearchQuery('');
      setSelectedMovie(null);
    }
  }, [ticket]);

  // Handle bottom sheet state
  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible]);

  // Handle sheet close
  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      onClose();
    }
  }, [onClose]);

  // Keyboard listeners — scroll to focused field manually since keyboardBehavior
  // prop doesn't fire reliably when BottomSheet is inside a React Native Modal.
  const scrollToKey = useCallback((key: string) => {
    const y = formOffset.current + (rowOffsets.current[key] ?? 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      kbHeightRef.current = e.endCoordinates.height;
      setKbHeight(e.endCoordinates.height);
      if (focusedFieldKey.current) scrollToKey(focusedFieldKey.current);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      kbHeightRef.current = 0;
      setKbHeight(0);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => { show.remove(); hide.remove(); };
  }, [visible, scrollToKey]);

  const handleFieldFocus = useCallback((key: string) => {
    focusedFieldKey.current = key;
    // If keyboard is already up (switching fields), scroll immediately
    if (kbHeightRef.current > 0) scrollToKey(key);
  }, [scrollToKey]);

  // Handle form field changes
  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Movie search handlers
  const handleEnterSearchMode = () => {
    setSearchQuery(formData.movieTitle || '');
    setIsSearchMode(true);
  };

  const handleMovieSelect = (movie: TMDBMovie) => {
    setSelectedMovie(movie);
    setFormData((prev) => ({ ...prev, movieTitle: movie.title }));
    setIsSearchMode(false);
    setSearchQuery('');
  };

  const handleCancelSearch = () => {
    setIsSearchMode(false);
    setSearchQuery('');
  };

  // Handle save
  const handleSave = () => {
    if (!ticket) return;

    // Sanitize text fields
    const sanitizedTheater = formData.theater.trim().slice(0, 100) || null;
    const sanitizedAuditorium = formData.auditorium.trim().slice(0, 10) || null;
    const sanitizedRow = formData.row.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || null;
    const sanitizedSeat = formData.seat.trim().replace(/[^A-Z0-9]/g, '').slice(0, 5) || null;

    // Validate date — must be YYYY-MM-DD and a real date
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const sanitizedDate =
      formData.date && dateRegex.test(formData.date) && !isNaN(Date.parse(formData.date))
        ? formData.date
        : null;

    // Validate time
    const sanitizedTime = formData.time?.trim() || null;

    // Parse and validate price (positive number under $9999, preserving currency)
    let priceAmount: number | null = null;
    let priceCurrency = ticket.priceCurrency || 'USD';
    if (formData.price) {
      const priceMatch = formData.price.match(/([£€$]?)(\d+\.?\d*)/);
      if (priceMatch) {
        const val = parseFloat(priceMatch[2]);
        priceAmount = !isNaN(val) && val >= 0 && val < 9999 ? val : null;
        if (priceMatch[1] === '£') priceCurrency = 'GBP';
        else if (priceMatch[1] === '€') priceCurrency = 'EUR';
        else if (priceMatch[1] === '$') priceCurrency = 'USD';
      }
    }

    // Get MPAA rating (validate it's one of the valid options)
    const mpaaRating = MPAA_RATING_OPTIONS.includes(formData.rating) ? formData.rating : null;

    // Update TMDB match if a new movie was selected
    let updatedTmdbMatch: TMDBMatch | null = ticket.tmdbMatch;
    if (selectedMovie) {
      updatedTmdbMatch = {
        movie: selectedMovie,
        confidence: 1.0,
        matchedTitle: selectedMovie.title,
        originalTitle: ticket.movieTitle || selectedMovie.title,
      };
    }

    // Validate ticketType
    const ticketType = TICKET_TYPE_OPTIONS.includes(formData.ticketType) ? formData.ticketType : (formData.ticketType.trim() || null);

    // Create updated ticket with sanitized values
    const updatedTicket: ProcessedTicket = {
      ...ticket,
      movieTitle: formData.movieTitle || null,
      theaterName: sanitizedTheater,
      date: sanitizedDate,
      showtime: sanitizedTime,
      seatRow: sanitizedRow,
      seatNumber: sanitizedSeat,
      format: formData.format !== 'Standard' ? formData.format : null,
      priceAmount,
      priceCurrency,
      auditorium: sanitizedAuditorium,
      mpaaRating,
      ticketType,
      tmdbMatch: updatedTmdbMatch,
      wasModified: true,
    };

    onSave(updatedTicket);
  };

  if (!visible) return null;

  // Limit search results to 5
  const searchResults = movies.slice(0, 5);

  // Determine match info for display
  const hasMatch = ticket?.tmdbMatch || selectedMovie;
  const matchConfidence = selectedMovie
    ? 100
    : ticket?.tmdbMatch
      ? Math.round(ticket.tmdbMatch.confidence * 100)
      : null;
  const searchButtonText = hasMatch ? 'Change' : 'Search';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.container}>
        {/* Custom blur backdrop */}
        <Pressable style={styles.backdrop} onPress={onClose}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.backdropOverlay} />
        </Pressable>

        <BottomSheet
          ref={bottomSheetRef}
          index={0}
          snapPoints={snapPoints}
          onChange={handleSheetChanges}
          enablePanDownToClose
          style={styles.bottomSheet}
          backgroundStyle={styles.bottomSheetBackground}
          handleIndicatorStyle={styles.handleIndicator}
        >
          <BottomSheetScrollView
            ref={scrollRef}
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, kbHeight > 0 && { paddingBottom: kbHeight + 34 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Title */}
            <Text style={styles.modalTitle}>Edit Ticket Details</Text>

            {/* Form */}
            <View style={styles.form} onLayout={(e) => { formOffset.current = e.nativeEvent.layout.y; }}>
              {/* Movie Title */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Movie Title</Text>
                {isSearchMode ? (
                  // Search Mode UI
                  <View style={styles.searchModeContainer}>
                    <View style={styles.searchInputRow}>
                      <TextInput
                        style={[styles.input, styles.searchInput]}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search for movie..."
                        placeholderTextColor={Colors.dark.textTertiary}
                        autoCapitalize="words"
                        autoFocus
                        returnKeyType="search"
                      />
                      <Pressable
                        style={styles.cancelSearchButton}
                        onPress={() => {
                          Keyboard.dismiss();
                          handleCancelSearch();
                        }}
                      >
                        <Text style={styles.cancelSearchButtonText}>Cancel</Text>
                      </Pressable>
                    </View>

                    {/* Search Results */}
                    <View style={styles.searchResultsList}>
                      {isLoading ? (
                        <View style={styles.searchLoadingContainer}>
                          <ActivityIndicator size="small" color={Colors.dark.tint} />
                          <Text style={styles.searchLoadingText}>Searching...</Text>
                        </View>
                      ) : debouncedSearchQuery.length < 2 ? (
                        <Text style={styles.searchHintText}>
                          Type at least 2 characters to search
                        </Text>
                      ) : searchResults.length === 0 ? (
                        <Text style={styles.searchHintText}>
                          No movies found
                        </Text>
                      ) : (
                        <ScrollView
                          style={styles.searchResultsScroll}
                          keyboardShouldPersistTaps="handled"
                          nestedScrollEnabled
                        >
                          {searchResults.map((movie) => (
                            <TicketMovieSearchResult
                              key={movie.id}
                              movie={movie}
                              onSelect={handleMovieSelect}
                            />
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  </View>
                ) : (
                  // Title Display Mode UI
                  <View style={styles.titleDisplayRow}>
                    <View style={styles.titleDisplayContainer}>
                      <Text
                        style={[
                          styles.titleDisplayText,
                          !formData.movieTitle && styles.titleDisplayPlaceholder,
                        ]}
                        numberOfLines={1}
                      >
                        {formData.movieTitle || 'No movie selected'}
                      </Text>
                      {hasMatch && matchConfidence !== null && (
                        <Text style={styles.matchInfo}>
                          Matched ({matchConfidence}%)
                        </Text>
                      )}
                    </View>
                    <Pressable
                      style={styles.searchButton}
                      onPress={() => {
                        Keyboard.dismiss();
                        handleEnterSearchMode();
                      }}
                    >
                      <Text style={styles.searchButtonText}>{searchButtonText}</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {/* Theater and Auditorium row */}
              <View style={styles.formRow} onLayout={(e) => { rowOffsets.current.theater = e.nativeEvent.layout.y; }}>
                <View style={[styles.formGroup, styles.formGroupFlex2]}>
                  <Text style={styles.label}>Theater</Text>
                  <FormTextInput
                    ref={theaterRef}
                    style={styles.input}
                    value={formData.theater}
                    onChangeText={(value) => handleChange('theater', value)}
                    placeholder="Theater name"
                    placeholderTextColor={Colors.dark.textTertiary}
                    autoCapitalize="words"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onFocus={() => handleFieldFocus('theater')}
                    onSubmitEditing={() => auditoriumRef.current?.focus()}
                  />
                </View>
                <View style={[styles.formGroup, styles.formGroupFlex1]}>
                  <Text style={styles.label}>Auditorium</Text>
                  <FormTextInput
                    ref={auditoriumRef}
                    style={[styles.input, styles.inputCenter]}
                    value={formData.auditorium}
                    onChangeText={(value) => handleChange('auditorium', value)}
                    placeholder="1"
                    placeholderTextColor={Colors.dark.textTertiary}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onFocus={() => handleFieldFocus('theater')}
                    onSubmitEditing={() => rowRef.current?.focus()}
                  />
                </View>
              </View>

              {/* Date and Time row */}
              <View style={styles.formRow}>
                <View style={[styles.formGroup, styles.formGroupFlex2]}>
                  <Text style={styles.label}>Date</Text>
                  <DatePickerField
                    value={formData.date}
                    onChange={(value) => handleChange('date', value)}
                  />
                </View>
                <View style={[styles.formGroup, styles.formGroupFlex1]}>
                  <Text style={styles.label}>Time</Text>
                  <TimePickerField
                    value={formData.time}
                    onChange={(value) => handleChange('time', value)}
                  />
                </View>
              </View>

              {/* Row and Seat row */}
              <View style={styles.formRow} onLayout={(e) => { rowOffsets.current.row = e.nativeEvent.layout.y; }}>
                <View style={[styles.formGroup, styles.formGroupFlex1]}>
                  <Text style={styles.label}>Row</Text>
                  <FormTextInput
                    ref={rowRef}
                    style={[styles.input, styles.inputCenter]}
                    value={formData.row}
                    onChangeText={(value) => handleChange('row', value.toUpperCase())}
                    placeholder="A"
                    placeholderTextColor={Colors.dark.textTertiary}
                    autoCapitalize="characters"
                    maxLength={3}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onFocus={() => handleFieldFocus('row')}
                    onSubmitEditing={() => seatRef.current?.focus()}
                  />
                </View>
                <View style={[styles.formGroup, styles.formGroupFlex1]}>
                  <Text style={styles.label}>Seat</Text>
                  <FormTextInput
                    ref={seatRef}
                    style={[styles.input, styles.inputCenter]}
                    value={formData.seat}
                    onChangeText={(value) => handleChange('seat', value)}
                    placeholder="1"
                    placeholderTextColor={Colors.dark.textTertiary}
                    keyboardType="number-pad"
                    maxLength={3}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onFocus={() => handleFieldFocus('row')}
                    onSubmitEditing={() => priceRef.current?.focus()}
                  />
                </View>
              </View>

              {/* Format, Price, and Rated row */}
              <View style={styles.formRow} onLayout={(e) => { rowOffsets.current.price = e.nativeEvent.layout.y; }}>
                <View style={[styles.formGroup, styles.formGroupFlex1]}>
                  <Text style={styles.label}>Format</Text>
                  <Pressable
                    style={styles.selectButton}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowFormatPicker(!showFormatPicker);
                      setShowRatingPicker(false);
                      setShowTicketTypePicker(false);
                    }}
                  >
                    <Text style={styles.selectButtonText}>{formData.format}</Text>
                    <Text style={styles.selectButtonIcon}>▼</Text>
                  </Pressable>
                </View>
                <View style={[styles.formGroup, styles.formGroupFlex2]}>
                  <Text style={styles.label}>Price</Text>
                  <FormTextInput
                    ref={priceRef}
                    style={styles.input}
                    value={formData.price}
                    onChangeText={(value) => handleChange('price', value)}
                    placeholder="$22.99"
                    placeholderTextColor={Colors.dark.textTertiary}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    blurOnSubmit={true}
                    onFocus={() => handleFieldFocus('price')}
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
                <View style={[styles.formGroup, styles.formGroupFlex1]}>
                  <Text style={styles.label}>Rated</Text>
                  <Pressable
                    style={styles.selectButton}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowRatingPicker(!showRatingPicker);
                      setShowFormatPicker(false);
                      setShowTicketTypePicker(false);
                    }}
                  >
                    <Text style={styles.selectButtonText}>
                      {formData.rating || 'NR'}
                    </Text>
                    <Text style={styles.selectButtonIcon}>▼</Text>
                  </Pressable>
                </View>
              </View>

              {/* Ticket Type row */}
              <View style={styles.formRow}>
                <View style={[styles.formGroup, styles.formGroupFlex1]}>
                  <Text style={styles.label}>Ticket Type</Text>
                  <Pressable
                    style={styles.selectButton}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowTicketTypePicker(!showTicketTypePicker);
                      setShowFormatPicker(false);
                      setShowRatingPicker(false);
                    }}
                  >
                    <Text style={styles.selectButtonText}>
                      {formData.ticketType || 'Select'}
                    </Text>
                    <Text style={styles.selectButtonIcon}>▼</Text>
                  </Pressable>
                </View>
              </View>

              {/* Format Picker (inline dropdown) */}
              {showFormatPicker && (
                <View style={styles.formatPicker}>
                  {FORMAT_OPTIONS.map((format) => (
                    <Pressable
                      key={format}
                      style={[
                        styles.formatOption,
                        formData.format === format && styles.formatOptionSelected,
                      ]}
                      onPress={() => {
                        handleChange('format', format);
                        setShowFormatPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.formatOptionText,
                          formData.format === format && styles.formatOptionTextSelected,
                        ]}
                      >
                        {format}
                      </Text>
                      {formData.format === format && (
                        <Text style={styles.formatOptionCheck}>✓</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}

              {/* MPAA Rating Picker (inline dropdown) */}
              {showRatingPicker && (
                <View style={styles.formatPicker}>
                  {MPAA_RATING_OPTIONS.map((rating) => (
                    <Pressable
                      key={rating}
                      style={[
                        styles.formatOption,
                        formData.rating === rating && styles.formatOptionSelected,
                      ]}
                      onPress={() => {
                        handleChange('rating', rating);
                        setShowRatingPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.formatOptionText,
                          formData.rating === rating && styles.formatOptionTextSelected,
                        ]}
                      >
                        {rating}
                      </Text>
                      {formData.rating === rating && (
                        <Text style={styles.formatOptionCheck}>✓</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Ticket Type Picker (inline dropdown) */}
              {showTicketTypePicker && (
                <View style={styles.formatPicker}>
                  {TICKET_TYPE_OPTIONS.map((type) => (
                    <Pressable
                      key={type}
                      style={[
                        styles.formatOption,
                        formData.ticketType === type && styles.formatOptionSelected,
                      ]}
                      onPress={() => {
                        handleChange('ticketType', type);
                        setShowTicketTypePicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.formatOptionText,
                          formData.ticketType === type && styles.formatOptionTextSelected,
                        ]}
                      >
                        {type}
                      </Text>
                      {formData.ticketType === type && (
                        <Text style={styles.formatOptionCheck}>✓</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Action buttons */}
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleSave}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </Pressable>
            </View>
          </BottomSheetScrollView>
        </BottomSheet>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  bottomSheet: {
    zIndex: 1,
  },
  bottomSheetBackground: {
    backgroundColor: Colors.dark.card,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  handleIndicator: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.textTertiary,
    borderRadius: BorderRadius.full,
    opacity: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 34, // Safe area bottom
    paddingTop: Spacing.md,
  },

  // Title
  modalTitle: {
    ...Typography.display.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },

  // Form
  form: {
    gap: Spacing.md,
  },
  formGroup: {
    gap: Spacing.xs,
  },
  formRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  formGroupFlex1: {
    flex: 1,
  },
  formGroupFlex2: {
    flex: 2,
  },
  label: {
    ...Typography.body.xs,
    color: Colors.dark.textTertiary,
    fontWeight: '500',
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: Colors.dark.text,
    fontSize: 15,
  },
  inputCenter: {
    textAlign: 'center',
  },
  inputWithIcon: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: 12,
    top: 12,
    fontSize: 16,
    zIndex: 1,
  },
  inputWithIconPadding: {
    paddingLeft: 40,
  },

  // Select button (for format dropdown)
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  selectButtonText: {
    color: Colors.dark.text,
    fontSize: 15,
  },
  selectButtonIcon: {
    color: Colors.dark.textTertiary,
    fontSize: 10,
  },

  // Format picker
  formatPicker: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.sm,
    marginTop: -Spacing.sm,
    overflow: 'hidden',
  },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  formatOptionSelected: {
    backgroundColor: 'rgba(225, 29, 72, 0.1)',
  },
  formatOptionText: {
    color: Colors.dark.text,
    fontSize: 15,
  },
  formatOptionTextSelected: {
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  formatOptionCheck: {
    color: Colors.dark.tint,
    fontSize: 16,
    fontWeight: '600',
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  cancelButton: {
    flex: 0,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    ...Typography.body.base,
    color: Colors.dark.textSecondary,
    fontWeight: '500',
  },
  saveButton: {
    flex: 1,
    backgroundColor: Colors.dark.tint,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  saveButtonText: {
    ...Typography.button.primary,
    color: '#fff',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },

  // Movie Search Styles
  searchModeContainer: {
    gap: Spacing.sm,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
  },
  cancelSearchButton: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
  },
  cancelSearchButtonText: {
    ...Typography.body.sm,
    color: Colors.dark.textSecondary,
    fontWeight: '500',
  },
  searchResultsList: {
    maxHeight: 200,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  searchResultsScroll: {
    maxHeight: 200,
  },
  searchLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  searchLoadingText: {
    ...Typography.body.sm,
    color: Colors.dark.textSecondary,
  },
  searchHintText: {
    ...Typography.body.sm,
    color: Colors.dark.textTertiary,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },

  // Title Display Styles
  titleDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  titleDisplayContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  titleDisplayText: {
    color: Colors.dark.text,
    fontSize: 15,
  },
  titleDisplayPlaceholder: {
    color: Colors.dark.textTertiary,
  },
  matchInfo: {
    ...Typography.body.xs,
    color: Colors.dark.accentSecondary,
    marginTop: 2,
  },
  searchButton: {
    backgroundColor: Colors.dark.tint,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  searchButtonText: {
    ...Typography.body.sm,
    color: '#fff',
    fontWeight: '600',
  },
});

export default TicketEditModal;
