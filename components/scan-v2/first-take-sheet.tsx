/**
 * Ticket Scan v2 — `FirstTakeSheet` (First Take wizard).
 *
 * Native recreation of the prototype's `FirstTakeModal` (`scan-screens2.jsx`):
 * a 5-step, fully-skippable wizard shown after a v2 scan saves to the journey,
 * run once per saved movie in a batch. Steps: (1) rating via `RatingSlider`,
 * (2) a 280-char reaction, (3) spoiler flag, (4) visibility, (5) a post summary.
 * Every step is skippable to a valid empty state; "Back" walks across both step
 * and movie boundaries; the X abandons the rest of the batch.
 *
 * Each posted movie commits via `createFirstTake` — `DUPLICATE_FIRST_TAKE`
 * (re-take of an already-taken movie) is swallowed so the batch keeps moving.
 * Reuses the EditSheet Modal + keyboard-avoidance shell; dark-only
 * (`ScanV2Colors`/`ScanV2Accent`), sizes via `s()`, text via `ScanText`.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  Animated,
  Easing,
  Platform,
  Keyboard,
  Dimensions,
  type KeyboardEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { createFirstTake } from '@/lib/first-take-service';
import { captureException } from '@/lib/sentry';
import type { ReviewVisibility } from '@/lib/database.types';
import type { SavedMovie } from '@/lib/scan-save';
import { Icon, ScanText, PillButton, Chip, type ScanIconName } from './primitives';
import { RatingSlider } from './rating-slider';

const TOTAL = 5;
const MAX_REACTION = 280;

type VisKey = 'Public' | 'Followers' | 'Private';

interface TakeDraft {
  rating: number | null;
  text: string;
  spoiler: boolean;
  vis: VisKey;
}

const blankTake = (): TakeDraft => ({ rating: null, text: '', spoiler: false, vis: 'Public' });

// Design Public/Followers/Private → DB visibility (CHECK: public/followers_only/private).
const VIS_TO_REVIEW: Record<VisKey, ReviewVisibility> = {
  Public: 'public',
  Followers: 'followers_only',
  Private: 'private',
};

const VIS_OPTIONS: { key: VisKey; icon: ScanIconName; desc: string }[] = [
  { key: 'Public', icon: 'share', desc: 'Anyone on PocketStubs' },
  { key: 'Followers', icon: 'check', desc: 'Just people who follow you' },
  { key: 'Private', icon: 'info', desc: 'Only you' },
];

const SPOILER_OPTIONS: { value: boolean; title: string; desc: string; icon: ScanIconName }[] = [
  { value: false, title: 'No spoilers', desc: 'Safe for everyone to read', icon: 'check' },
  { value: true, title: 'Contains spoilers', desc: 'Blurred until tapped', icon: 'warn' },
];

interface FirstTakeSheetProps {
  userId: string;
  /** Successfully-saved movies, in order — one step-sequence per entry. */
  movies: SavedMovie[];
  /** Abandon (X) — the caller applies the post-save navigation. */
  onClose: () => void;
  /** Finished the last movie — the caller applies the post-save navigation. */
  onDone: () => void;
}

export function FirstTakeSheet({ userId, movies, onClose, onDone }: FirstTakeSheetProps) {
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [isPosting, setIsPosting] = useState(false);
  const [takes, setTakes] = useState<TakeDraft[]>(() => movies.map(blankTake));

  const multi = movies.length > 1;
  const movie = movies[idx];
  const take = takes[idx];
  const last = idx === movies.length - 1;

  const patch = useCallback(
    (partial: Partial<TakeDraft>) => {
      setTakes((ts) => ts.map((t, i) => (i === idx ? { ...t, ...partial } : t)));
    },
    [idx]
  );

  const goStep = useCallback((n: number) => setStep(Math.max(0, Math.min(TOTAL - 1, n))), []);

  // Commit the current movie's take, then advance to the next movie or finish.
  // DUPLICATE_FIRST_TAKE (re-scan of an already-taken movie) is non-fatal.
  const postMovie = useCallback(async () => {
    if (isPosting) return;
    setIsPosting(true);
    try {
      await createFirstTake(userId, {
        tmdbId: movie.tmdbId,
        movieTitle: movie.title,
        posterPath: movie.posterPath,
        reactionEmoji: '',
        quoteText: take.text,
        isSpoiler: take.spoiler,
        rating: take.rating,
        visibility: VIS_TO_REVIEW[take.vis],
      });
    } catch (err) {
      if (!(err instanceof Error && err.message === 'DUPLICATE_FIRST_TAKE')) {
        captureException(err instanceof Error ? err : new Error(String(err)), {
          context: 'scan-v2-first-take-create',
        });
      }
      // Either way, skip this movie gracefully and keep the batch moving.
    } finally {
      setIsPosting(false);
    }

    if (last) {
      onDone();
    } else {
      setIdx((i) => i + 1);
      setStep(0);
    }
  }, [isPosting, userId, movie, take, last, onDone]);

  const advance = useCallback(() => {
    if (step < TOTAL - 1) goStep(step + 1);
    else void postMovie();
  }, [step, goStep, postMovie]);

  const onBack = useCallback(() => {
    if (step > 0) goStep(step - 1);
    else if (idx > 0) {
      setIdx((i) => i - 1);
      setStep(TOTAL - 1);
    }
  }, [step, idx, goStep]);

  const canBack = step > 0 || idx > 0;

  // Keyboard avoidance (reaction step): scroll the focused field above the keyboard.
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const focusedInput = useRef<TextInput | null>(null);
  const kbHeightRef = useRef(0);

  const ensureVisible = useCallback((input: TextInput | null) => {
    const sv = scrollRef.current;
    if (!sv || !input) return;
    requestAnimationFrame(() => {
      input.measureInWindow((_x, y, _w, h) => {
        if (kbHeightRef.current <= 0) return;
        const kbTop = Dimensions.get('window').height - kbHeightRef.current;
        const overlap = y + h + s(44) - kbTop;
        if (overlap > 0) sv.scrollTo({ y: scrollY.current + overlap, animated: true });
      });
    });
  }, []);

  useEffect(() => {
    kbHeightRef.current = kbHeight;
    if (kbHeight > 0) ensureVisible(focusedInput.current);
  }, [kbHeight, ensureVisible]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' } as any} onPress={onClose} />

        <View
          style={{
            backgroundColor: ScanV2Colors.surface,
            borderTopLeftRadius: s(26),
            borderTopRightRadius: s(26),
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: ScanV2Colors.line,
            maxHeight: '94%',
            overflow: 'hidden',
          }}
        >
          {/* grabber */}
          <View style={{ alignItems: 'center', paddingTop: s(10) }}>
            <View style={{ width: s(38), height: s(5), borderRadius: 999, backgroundColor: ScanV2Colors.lineHi }} />
          </View>

          {/* top row: movie counter (multi) + X */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(8), paddingHorizontal: s(16), paddingTop: s(8), paddingBottom: s(10) }}>
            <View style={{ minWidth: s(54) }}>
              {multi ? (
                <ScanText style={{ fontFamily: Fonts.mono.medium, fontSize: s(11), lineHeight: s(14), letterSpacing: 1, color: ScanV2Colors.ter }}>
                  {idx + 1} / {movies.length}
                </ScanText>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={{ width: s(30), height: s(30), borderRadius: 999, backgroundColor: ScanV2Colors.field, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={s(16)} color={ScanV2Colors.sec} />
            </Pressable>
          </View>

          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingHorizontal: s(16), paddingBottom: s(40) }}
            showsVerticalScrollIndicator={false}
          >
            <StepHeader step={step} movie={movie} idx={idx} count={movies.length} multi={multi} onBack={canBack ? onBack : undefined} />

            <StepFade stepKey={`${idx}-${step}`}>
              {step === 0 && (
                <View>
                  <Headline
                    title="How was it?"
                    sub="Drag to score it 1.0 to 10.0 — or skip if you'd rather just leave a few words."
                  />
                  <RatingSlider value={take.rating} onChange={(v) => patch({ rating: v })} />
                  <StepActions
                    nextLabel="Continue"
                    nextIcon="arrowR"
                    skipLabel="Not rating this one"
                    onNext={advance}
                    onSkip={() => {
                      patch({ rating: null });
                      advance();
                    }}
                  />
                </View>
              )}

              {step === 1 && (
                <View>
                  <Headline
                    title="What was your first reaction?"
                    sub="Straight out of the theater — a sentence is plenty. No wrong answers."
                  />
                  <View>
                    <TextInput
                      value={take.text}
                      onChangeText={(v) => patch({ text: v })}
                      maxLength={MAX_REACTION}
                      multiline
                      autoFocus
                      allowFontScaling={false}
                      onFocus={(e) => {
                        focusedInput.current = e.target as unknown as TextInput;
                        ensureVisible(focusedInput.current);
                      }}
                      placeholder="e.g. The IMAX sound design wrecked me — did not see that ending coming."
                      placeholderTextColor={ScanV2Colors.ter}
                      textAlignVertical="top"
                      style={{
                        minHeight: s(120),
                        backgroundColor: ScanV2Colors.field,
                        borderWidth: 1,
                        borderColor: ScanV2Colors.fieldLine,
                        borderRadius: s(14),
                        padding: s(14),
                        paddingBottom: s(28),
                        color: ScanV2Colors.text,
                        fontFamily: Fonts.inter.regular,
                        fontSize: s(15.5),
                        lineHeight: s(23),
                      }}
                    />
                    <ScanText
                      style={{ position: 'absolute', bottom: s(10), right: s(12), fontFamily: Fonts.mono.medium, fontSize: s(11), lineHeight: s(13), color: ScanV2Colors.ter }}
                    >
                      {take.text.length}/{MAX_REACTION}
                    </ScanText>
                  </View>
                  <StepActions
                    nextLabel="Continue"
                    nextIcon="arrowR"
                    skipLabel="Skip — no words this time"
                    onNext={advance}
                    onSkip={() => {
                      patch({ text: '' });
                      advance();
                    }}
                  />
                </View>
              )}

              {step === 2 && (
                <View>
                  <Headline
                    title="Any spoilers in there?"
                    sub={take.text ? "We'll blur your take until people tap to reveal it." : 'You can set this even if you skipped the words.'}
                  />
                  <View style={{ gap: s(10) }}>
                    {SPOILER_OPTIONS.map((o) => (
                      <OptionRow
                        key={String(o.value)}
                        selected={take.spoiler === o.value}
                        icon={o.icon}
                        title={o.title}
                        desc={o.desc}
                        onPress={() => patch({ spoiler: o.value })}
                      />
                    ))}
                  </View>
                  <StepActions
                    nextLabel="Continue"
                    nextIcon="arrowR"
                    skipLabel="Skip"
                    onNext={advance}
                    onSkip={() => {
                      patch({ spoiler: false });
                      advance();
                    }}
                  />
                </View>
              )}

              {step === 3 && (
                <View>
                  <Headline title="Who can see this?" sub="You can change the default for every take later in Settings." />
                  <View style={{ gap: s(10) }}>
                    {VIS_OPTIONS.map((o) => (
                      <OptionRow
                        key={o.key}
                        selected={take.vis === o.key}
                        icon={o.icon}
                        title={o.key}
                        desc={o.desc}
                        onPress={() => patch({ vis: o.key })}
                      />
                    ))}
                  </View>
                  <StepActions
                    nextLabel="Continue"
                    nextIcon="arrowR"
                    skipLabel="Keep it public"
                    onNext={advance}
                    onSkip={advance}
                  />
                </View>
              )}

              {step === 4 && (
                <View>
                  <Headline
                    title="Ready to post"
                    sub={
                      take.rating == null && !take.text
                        ? "You're logging this one with no rating or words — totally fine. You can add a take anytime."
                        : "Here's your take. Edit anything by stepping back."
                    }
                  />
                  <SummaryCard take={take} />
                  <View style={{ marginTop: s(22), gap: s(8) }}>
                    <PillButton
                      full
                      icon={last ? 'check' : 'arrowR'}
                      label={multi && !last ? 'Post & next movie' : multi ? 'Post & finish' : 'Post First Take'}
                      onPress={() => void postMovie()}
                      disabled={isPosting}
                    />
                    <Pressable onPress={() => void postMovie()} disabled={isPosting} style={{ minHeight: s(38), alignItems: 'center', justifyContent: 'center' }}>
                      <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(14), lineHeight: s(18), color: ScanV2Colors.sec }}>
                        {multi && !last ? 'Skip this movie' : 'Skip for now'}
                      </ScanText>
                    </Pressable>
                  </View>
                </View>
              )}
            </StepFade>

            {/* keyboard / home-indicator safe spacer */}
            <View style={{ height: (kbHeight > 0 ? kbHeight : insets.bottom) + s(8) }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// Step header — progress segments + back + movie context
// ============================================================================

interface StepHeaderProps {
  step: number;
  movie: SavedMovie;
  idx: number;
  count: number;
  multi: boolean;
  onBack?: () => void;
}

function StepHeader({ step, movie, idx, count, multi, onBack }: StepHeaderProps) {
  const posterUrl = getTMDBImageUrl(movie.posterPath, 'w185');
  return (
    <View style={{ marginBottom: s(18) }}>
      {/* progress segments */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={6}
            style={{ width: s(30), height: s(30), borderRadius: 999, backgroundColor: ScanV2Colors.field, borderWidth: 1, borderColor: ScanV2Colors.line, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="chevL" size={s(16)} color={ScanV2Colors.sec} />
          </Pressable>
        ) : (
          <View style={{ width: s(30) }} />
        )}
        <View style={{ flex: 1, flexDirection: 'row', gap: s(5) }}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <View
              key={i}
              style={{ flex: 1, height: s(5), borderRadius: 999, backgroundColor: i <= step ? ScanV2Accent.primary : ScanV2Colors.lineHi }}
            />
          ))}
        </View>
        <ScanText style={{ width: s(30), textAlign: 'right', fontFamily: Fonts.mono.medium, fontSize: s(11), lineHeight: s(14), letterSpacing: 0.5, color: ScanV2Colors.ter }}>
          {step + 1}/{TOTAL}
        </ScanText>
      </View>

      {/* movie context */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10), marginTop: s(16) }}>
        <View style={{ width: s(38), height: s(54), borderRadius: s(8), overflow: 'hidden', backgroundColor: '#1b1b20', alignItems: 'center', justifyContent: 'center' }}>
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <Icon name="film" size={s(18)} color={ScanV2Colors.ter} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ScanText numberOfLines={1} style={{ fontFamily: Fonts.outfit.bold, fontSize: s(17), lineHeight: s(21), color: ScanV2Colors.text }}>
            {movie.title}
          </ScanText>
          <ScanText style={{ fontFamily: Fonts.mono.medium, fontSize: s(11), lineHeight: s(14), letterSpacing: 0.5, color: ScanV2Accent.primary, marginTop: s(2) }}>
            {multi ? `FIRST TAKE · MOVIE ${idx + 1} OF ${count}` : 'YOUR FIRST TAKE'}
          </ScanText>
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// Step actions (Continue + skip) + headline + option row + summary
// ============================================================================

interface StepActionsProps {
  nextLabel: string;
  nextIcon?: ScanIconName;
  skipLabel: string;
  onNext: () => void;
  onSkip: () => void;
}

function StepActions({ nextLabel, nextIcon, skipLabel, onNext, onSkip }: StepActionsProps) {
  return (
    <View style={{ marginTop: s(22), gap: s(8) }}>
      <PillButton full label={nextLabel} iconRight={nextIcon} onPress={onNext} />
      <Pressable onPress={onSkip} style={{ minHeight: s(38), alignItems: 'center', justifyContent: 'center' }}>
        <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(14), lineHeight: s(18), color: ScanV2Colors.sec }}>{skipLabel}</ScanText>
      </Pressable>
    </View>
  );
}

function Headline({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginBottom: s(16) }}>
      <ScanText style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(24), lineHeight: s(27), letterSpacing: -0.4, color: ScanV2Colors.text }}>{title}</ScanText>
      {sub ? (
        <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(13.5), lineHeight: s(19.5), color: ScanV2Colors.sec, marginTop: s(6) }}>{sub}</ScanText>
      ) : null}
    </View>
  );
}

interface OptionRowProps {
  selected: boolean;
  icon: ScanIconName;
  title: string;
  desc: string;
  onPress: () => void;
}

function OptionRow({ selected, icon, title, desc, onPress }: OptionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        padding: s(14),
        borderRadius: s(15),
        backgroundColor: selected ? ScanV2Accent.soft : ScanV2Colors.field,
        borderWidth: 1.5,
        borderColor: selected ? ScanV2Accent.primary : ScanV2Colors.line,
      }}
    >
      <View
        style={{ width: s(34), height: s(34), borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? ScanV2Accent.primary : ScanV2Colors.cardHi }}
      >
        <Icon name={icon} size={s(17)} color={selected ? ScanV2Accent.on : ScanV2Colors.sec} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ScanText style={{ fontFamily: Fonts.inter.bold, fontSize: s(15.5), lineHeight: s(19), color: selected ? ScanV2Accent.primary : ScanV2Colors.text }}>{title}</ScanText>
        <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(12.5), lineHeight: s(16), color: ScanV2Colors.sec, marginTop: s(1) }}>{desc}</ScanText>
      </View>
      {selected ? <Icon name="check" size={s(18)} color={ScanV2Accent.primary} stroke={2.6} /> : null}
    </Pressable>
  );
}

function SummaryCard({ take }: { take: TakeDraft }) {
  return (
    <View style={{ backgroundColor: ScanV2Colors.card, borderWidth: 1, borderColor: ScanV2Colors.line, borderRadius: s(16), padding: s(16), gap: s(13) }}>
      {/* rating */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(10) }}>
        <ScanText style={{ fontFamily: Fonts.inter.medium, fontSize: s(13), lineHeight: s(16), color: ScanV2Colors.sec }}>Rating</ScanText>
        {take.rating == null ? (
          <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(14), lineHeight: s(17), color: ScanV2Colors.ter }}>No rating</ScanText>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <ScanText style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(18), lineHeight: s(22), color: ScanV2Accent.primary }}>{take.rating.toFixed(1)}</ScanText>
            <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(13), lineHeight: s(17), color: ScanV2Colors.ter }}>{' / 10'}</ScanText>
          </View>
        )}
      </View>
      <View style={{ height: 1, backgroundColor: ScanV2Colors.line }} />
      {/* words */}
      <View>
        <ScanText style={{ fontFamily: Fonts.inter.medium, fontSize: s(13), lineHeight: s(16), color: ScanV2Colors.sec }}>Your words</ScanText>
        <ScanText
          style={{
            fontFamily: Fonts.inter.regular,
            fontStyle: take.text ? 'normal' : 'italic',
            fontSize: s(14.5),
            lineHeight: s(21.75),
            color: take.text ? ScanV2Colors.text : ScanV2Colors.ter,
            marginTop: s(5),
          }}
        >
          {take.text || 'No words this time'}
        </ScanText>
      </View>
      <View style={{ height: 1, backgroundColor: ScanV2Colors.line }} />
      {/* visibility + spoiler chips */}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: s(8) }}>
        <Chip icon={take.vis === 'Private' ? 'info' : take.vis === 'Followers' ? 'check' : 'share'} label={take.vis} />
        {take.spoiler ? <Chip icon="warn" label="Spoilers" /> : null}
      </View>
    </View>
  );
}

// ============================================================================
// StepFade — ps_fadeUp on every step/movie change (keyed remount)
// ============================================================================

function StepFade({ stepKey, children }: { stepKey: string; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [stepKey, anim]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [s(10), 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// ============================================================================
// Keyboard height (drives the bottom spacer / scroll-into-view)
// ============================================================================

function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => setHeight(e.endCoordinates?.height ?? 0);
    const onHide = () => setHeight(0);
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);
  return height;
}
