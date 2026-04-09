/**
 * Ticket Edit Modal Component
 *
 * Bottom sheet modal for editing ticket details.
 * Uses @gorhom/bottom-sheet for smooth gestures.
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
// Design tokens
// ============================================================================

const COLOR = {
  bg: '#1C1C1E',
  card: '#2C2C2E',
  input: '#3A3A3C',
  label: '#8E8E93',
  red: '#FF3B5C',
  green: '#30D158',
  white: '#FFFFFF',
  textSecondary: '#EBEBF599',
};

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
  const snapPoints = useMemo(() => ['90%'], []);

  // Initialize form data when ticket changes
  useEffect(() => {
    if (ticket) {
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

  // Keyboard listeners
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

    const sanitizedTheater = formData.theater.trim().slice(0, 100) || null;
    const sanitizedAuditorium = formData.auditorium.trim().slice(0, 10) || null;
    const sanitizedRow = formData.row.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || null;
    const sanitizedSeat = formData.seat.trim().replace(/[^A-Z0-9]/g, '').slice(0, 5) || null;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const sanitizedDate =
      formData.date && dateRegex.test(formData.date) && !isNaN(Date.parse(formData.date))
        ? formData.date
        : null;

    const sanitizedTime = formData.time?.trim() || null;

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

    const mpaaRating = MPAA_RATING_OPTIONS.includes(formData.rating) ? formData.rating : null;

    let updatedTmdbMatch: TMDBMatch | null = ticket.tmdbMatch;
    if (selectedMovie) {
      updatedTmdbMatch = {
        movie: selectedMovie,
        confidence: 1.0,
        matchedTitle: selectedMovie.title,
        originalTitle: ticket.movieTitle || selectedMovie.title,
      };
    }

    const ticketType = TICKET_TYPE_OPTIONS.includes(formData.ticketType) ? formData.ticketType : (formData.ticketType.trim() || null);

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

  const searchResults = movies.slice(0, 5);

  const hasMatch = ticket?.tmdbMatch || selectedMovie;
  const matchConfidence = selectedMovie
    ? 100
    : ticket?.tmdbMatch
      ? Math.round(ticket.tmdbMatch.confidence * 100)
      : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.container}>
        {/* Blur backdrop */}
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
          {/* Fixed header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.headerCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Edit Ticket Details</Text>
            {/* Spacer to balance the Cancel button */}
            <View style={styles.headerSpacer} />
          </View>

          {/* Scrollable form + pinned footer */}
          <View style={styles.sheetBody}>
            <BottomSheetScrollView
              ref={scrollRef}
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollContent,
                kbHeight > 0 && { paddingBottom: kbHeight + 16 },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <View style={styles.cardStack} onLayout={(e) => { formOffset.current = e.nativeEvent.layout.y; }}>

                {/* ── Section 1: Movie Info ── */}
                <View style={styles.card}>
                  <Text style={styles.sectionHeader}>Movie Info</Text>

                  {isSearchMode ? (
                    /* Search mode — shown inside the card */
                    <View style={styles.searchModeContainer}>
                      <View style={styles.searchInputRow}>
                        <TextInput
                          style={[styles.inputField, styles.searchInput]}
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          placeholder="Search for movie..."
                          placeholderTextColor={COLOR.label}
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

                      <View style={styles.searchResultsList}>
                        {isLoading ? (
                          <View style={styles.searchLoadingContainer}>
                            <ActivityIndicator size="small" color={COLOR.red} />
                            <Text style={styles.searchHintText}>Searching...</Text>
                          </View>
                        ) : debouncedSearchQuery.length < 2 ? (
                          <Text style={styles.searchHintText}>
                            Type at least 2 characters to search
                          </Text>
                        ) : searchResults.length === 0 ? (
                          <Text style={styles.searchHintText}>No movies found</Text>
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
                    /* Title display mode */
                    <View style={styles.movieInfoRow}>
                      <View style={styles.movieInfoText}>
                        <Text
                          style={[
                            styles.movieTitle,
                            !formData.movieTitle && styles.movieTitlePlaceholder,
                          ]}
                          numberOfLines={2}
                        >
                          {formData.movieTitle || 'No movie selected'}
                        </Text>
                        {hasMatch && matchConfidence !== null && (
                          <View style={styles.matchBadge}>
                            <Text style={styles.matchBadgeText}>
                              Matched ({matchConfidence}%)
                            </Text>
                          </View>
                        )}
                      </View>
                      <Pressable
                        style={({ pressed }) => [
                          styles.changeButton,
                          pressed && styles.buttonPressed,
                        ]}
                        onPress={() => {
                          Keyboard.dismiss();
                          handleEnterSearchMode();
                        }}
                      >
                        <Text style={styles.changeButtonText}>Change</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* ── Section 2: Show Details ── */}
                <View style={styles.card}>
                  <Text style={styles.sectionHeader}>Show Details</Text>

                  <View
                    style={styles.fieldRow}
                    onLayout={(e) => { rowOffsets.current.theater = e.nativeEvent.layout.y; }}
                  >
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Theater</Text>
                      <FormTextInput
                        ref={theaterRef}
                        style={styles.inputField}
                        value={formData.theater}
                        onChangeText={(value) => handleChange('theater', value)}
                        placeholder="Theater name"
                        placeholderTextColor={COLOR.label}
                        autoCapitalize="words"
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onFocus={() => handleFieldFocus('theater')}
                        onSubmitEditing={() => auditoriumRef.current?.focus()}
                      />
                    </View>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Auditorium</Text>
                      <FormTextInput
                        ref={auditoriumRef}
                        style={styles.inputField}
                        value={formData.auditorium}
                        onChangeText={(value) => handleChange('auditorium', value)}
                        placeholder="1"
                        placeholderTextColor={COLOR.label}
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onFocus={() => handleFieldFocus('theater')}
                        onSubmitEditing={() => rowRef.current?.focus()}
                      />
                    </View>
                  </View>

                  <View style={styles.fieldRow}>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Date</Text>
                      <DatePickerField
                        value={formData.date}
                        onChange={(value) => handleChange('date', value)}
                      />
                    </View>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Time</Text>
                      <TimePickerField
                        value={formData.time}
                        onChange={(value) => handleChange('time', value)}
                      />
                    </View>
                  </View>
                </View>

                {/* ── Section 3: Seat Info ── */}
                <View style={styles.card}>
                  <Text style={styles.sectionHeader}>Seat Info</Text>

                  <View
                    style={styles.fieldRow}
                    onLayout={(e) => { rowOffsets.current.row = e.nativeEvent.layout.y; }}
                  >
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Row</Text>
                      <FormTextInput
                        ref={rowRef}
                        style={styles.inputField}
                        value={formData.row}
                        onChangeText={(value) => handleChange('row', value.toUpperCase())}
                        placeholder="A"
                        placeholderTextColor={COLOR.label}
                        autoCapitalize="characters"
                        maxLength={3}
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onFocus={() => handleFieldFocus('row')}
                        onSubmitEditing={() => seatRef.current?.focus()}
                      />
                    </View>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Seat</Text>
                      <FormTextInput
                        ref={seatRef}
                        style={styles.inputField}
                        value={formData.seat}
                        onChangeText={(value) => handleChange('seat', value)}
                        placeholder="1"
                        placeholderTextColor={COLOR.label}
                        keyboardType="number-pad"
                        maxLength={3}
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onFocus={() => handleFieldFocus('row')}
                        onSubmitEditing={() => priceRef.current?.focus()}
                      />
                    </View>
                  </View>
                </View>

                {/* ── Section 4: Ticket Options ── */}
                <View style={styles.card}>
                  <Text style={styles.sectionHeader}>Ticket Options</Text>

                  {/* Row 1: Format | Rated */}
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Format</Text>
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
                        <Text style={styles.selectButtonChevron}>▼</Text>
                      </Pressable>
                    </View>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Rated</Text>
                      <Pressable
                        style={styles.selectButton}
                        onPress={() => {
                          Keyboard.dismiss();
                          setShowRatingPicker(!showRatingPicker);
                          setShowFormatPicker(false);
                          setShowTicketTypePicker(false);
                        }}
                      >
                        <Text style={styles.selectButtonText}>{formData.rating || 'NR'}</Text>
                        <Text style={styles.selectButtonChevron}>▼</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Row 2: Price | Ticket Type */}
                  <View
                    style={styles.fieldRow}
                    onLayout={(e) => { rowOffsets.current.price = e.nativeEvent.layout.y; }}
                  >
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Price</Text>
                      <FormTextInput
                        ref={priceRef}
                        style={styles.inputField}
                        value={formData.price}
                        onChangeText={(value) => handleChange('price', value)}
                        placeholder="$22.99"
                        placeholderTextColor={COLOR.label}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        blurOnSubmit
                        onFocus={() => handleFieldFocus('price')}
                        onSubmitEditing={() => Keyboard.dismiss()}
                      />
                    </View>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Ticket Type</Text>
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
                        <Text style={styles.selectButtonChevron}>▼</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Inline pickers */}
                  {showFormatPicker && (
                    <View style={styles.pickerDropdown}>
                      {FORMAT_OPTIONS.map((format) => (
                        <Pressable
                          key={format}
                          style={[
                            styles.pickerOption,
                            formData.format === format && styles.pickerOptionSelected,
                          ]}
                          onPress={() => {
                            handleChange('format', format);
                            setShowFormatPicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              formData.format === format && styles.pickerOptionTextSelected,
                            ]}
                          >
                            {format}
                          </Text>
                          {formData.format === format && (
                            <Text style={styles.pickerCheck}>✓</Text>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {showRatingPicker && (
                    <View style={styles.pickerDropdown}>
                      {MPAA_RATING_OPTIONS.map((rating) => (
                        <Pressable
                          key={rating}
                          style={[
                            styles.pickerOption,
                            formData.rating === rating && styles.pickerOptionSelected,
                          ]}
                          onPress={() => {
                            handleChange('rating', rating);
                            setShowRatingPicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              formData.rating === rating && styles.pickerOptionTextSelected,
                            ]}
                          >
                            {rating}
                          </Text>
                          {formData.rating === rating && (
                            <Text style={styles.pickerCheck}>✓</Text>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {showTicketTypePicker && (
                    <View style={styles.pickerDropdown}>
                      {TICKET_TYPE_OPTIONS.map((type) => (
                        <Pressable
                          key={type}
                          style={[
                            styles.pickerOption,
                            formData.ticketType === type && styles.pickerOptionSelected,
                          ]}
                          onPress={() => {
                            handleChange('ticketType', type);
                            setShowTicketTypePicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              formData.ticketType === type && styles.pickerOptionTextSelected,
                            ]}
                          >
                            {type}
                          </Text>
                          {formData.ticketType === type && (
                            <Text style={styles.pickerCheck}>✓</Text>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </BottomSheetScrollView>

            {/* Pinned save button */}
            <View style={styles.footer}>
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
          </View>
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
    backgroundColor: COLOR.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    width: 36,
    height: 4,
    backgroundColor: COLOR.label,
    borderRadius: 2,
    opacity: 0.5,
  },

  // Header nav bar
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  headerCancel: {
    color: COLOR.white,
    fontSize: 17,
    fontWeight: '400',
    minWidth: 60,
  },
  headerTitle: {
    flex: 1,
    color: COLOR.white,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: 60,
  },

  // Sheet body (scroll + footer)
  sheetBody: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },

  cardStack: {
    gap: 10,
  },

  // Card sections
  card: {
    backgroundColor: COLOR.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 12,
    gap: 8,
  },
  sectionHeader: {
    color: COLOR.white,
    fontSize: 17,
    fontWeight: '700',
  },

  // Movie Info section
  movieInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  movieInfoText: {
    flex: 1,
    gap: 6,
  },
  movieTitle: {
    color: COLOR.white,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  movieTitlePlaceholder: {
    color: COLOR.label,
    fontWeight: '400',
    fontSize: 16,
  },
  matchBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(48, 209, 88, 0.18)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  matchBadgeText: {
    color: COLOR.green,
    fontSize: 12,
    fontWeight: '600',
  },
  changeButton: {
    backgroundColor: COLOR.red,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 90,
  },
  changeButtonText: {
    color: COLOR.white,
    fontSize: 16,
    fontWeight: '600',
  },

  // Field layout
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldGroup: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    color: COLOR.label,
    fontSize: 13,
    fontWeight: '400',
  },

  // Input field
  inputField: {
    backgroundColor: COLOR.input,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: COLOR.white,
    fontSize: 15,
  },

  // Select / dropdown button
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLOR.input,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectButtonText: {
    color: COLOR.white,
    fontSize: 15,
    flex: 1,
  },
  selectButtonChevron: {
    color: COLOR.label,
    fontSize: 10,
  },

  // Inline picker dropdown
  pickerDropdown: {
    backgroundColor: COLOR.input,
    borderRadius: 8,
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  pickerOptionSelected: {
    backgroundColor: 'rgba(255, 59, 92, 0.12)',
  },
  pickerOptionText: {
    color: COLOR.white,
    fontSize: 15,
  },
  pickerOptionTextSelected: {
    color: COLOR.red,
    fontWeight: '600',
  },
  pickerCheck: {
    color: COLOR.red,
    fontSize: 16,
    fontWeight: '600',
  },

  // Search mode
  searchModeContainer: {
    gap: 10,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
  },
  cancelSearchButton: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  cancelSearchButtonText: {
    color: COLOR.label,
    fontSize: 15,
    fontWeight: '500',
  },
  searchResultsList: {
    maxHeight: 200,
    backgroundColor: COLOR.input,
    borderRadius: 8,
    overflow: 'hidden',
  },
  searchResultsScroll: {
    maxHeight: 200,
  },
  searchLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  searchHintText: {
    color: COLOR.label,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },

  // Pinned footer
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 34,
    paddingTop: 12,
    backgroundColor: COLOR.bg,
  },
  saveButton: {
    backgroundColor: COLOR.red,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: COLOR.white,
    fontSize: 17,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});

export default TicketEditModal;
