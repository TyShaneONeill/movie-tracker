/**
 * Ticket Scan v2 — `ScreenReview`.
 *
 * Confirm-before-save list of ReviewCards with the block-on-unknown product
 * rule: if any ticket is `failed` (unmatched), the sticky CTA becomes
 * "Resolve N tickets" (opens the Resolve dialog) and save is blocked until every
 * ticket is matched or removed. When clean, CTA = "Save to Journey" (+ count).
 */

import React from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { useScanColors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import type { TicketVM } from '@/lib/scan-v2/ticket-view-model';
import { ReviewCard } from './review-card';
import { AvatarStack } from './avatar-stack';
import { Icon, ScanText, ScansPill, PillButton, TopBar } from './primitives';

interface ScreenReviewProps {
  tickets: TicketVM[];
  scansLeft: number;
  duplicatesRemoved: number;
  showDupNotice: boolean;
  isSaving: boolean;
  /** Batch-level "Who was there?" selection — applied to every ticket on save. */
  companions: string[];
  onDismissDup: () => void;
  onSearch: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  onOpenCompanions: () => void;
  onResolve: () => void;
  onSave: () => void;
  onBack: () => void;
}

export function ScreenReview({
  tickets,
  scansLeft,
  duplicatesRemoved,
  showDupNotice,
  isSaving,
  companions,
  onDismissDup,
  onSearch,
  onRemove,
  onEdit,
  onOpenCompanions,
  onResolve,
  onSave,
  onBack,
}: ScreenReviewProps) {
  const c = useScanColors();
  const insets = useSafeAreaInsets();
  const ready = tickets.filter((t) => t.status !== 'failed');
  const failed = tickets.filter((t) => t.status === 'failed');
  const blocked = failed.length > 0;

  const ctaLabel = blocked
    ? `Resolve ${failed.length} ticket${failed.length === 1 ? '' : 's'}`
    : `Save to Journey${ready.length > 1 ? ` · ${ready.length}` : ''}`;

  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: c.bg } as any}>
      <TopBar
        onBack={onBack}
        title="Review"
        sub={`${tickets.length} ticket${tickets.length === 1 ? '' : 's'} · ${ready.length} ready`}
        right={<ScansPill left={scansLeft} />}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: s(4), paddingHorizontal: s(16), paddingBottom: (blocked ? s(178) : s(124)) + insets.bottom, gap: s(12) }}
        showsVerticalScrollIndicator={false}
      >
        {showDupNotice && duplicatesRemoved > 0 && (
          <Pressable
            onPress={onDismissDup}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(8),
              paddingVertical: s(10),
              paddingHorizontal: s(13),
              borderRadius: s(12),
              backgroundColor: 'rgba(251,191,36,0.10)',
              borderWidth: 1,
              borderColor: 'rgba(251,191,36,0.25)',
            }}
          >
            <Icon name="info" size={s(15)} color={c.amber} />
            <ScanText style={{ flex: 1, fontFamily: Fonts.inter.medium, fontSize: s(12.5), lineHeight: s(16), color: c.text }}>
              {duplicatesRemoved} duplicate ticket{duplicatesRemoved === 1 ? ' was' : 's were'} removed.
            </ScanText>
            <Icon name="x" size={s(14)} color={c.ter} />
          </Pressable>
        )}

        {tickets.map((t) => (
          <ReviewCard key={t.id} ticket={t} onSearch={onSearch} onRemove={onRemove} onEdit={onEdit} />
        ))}

        {/* Batch-level companions — you scanned these together, so one selection
            covers the whole batch and lands on every saved journey (#782). */}
        <Pressable
          onPress={onOpenCompanions}
          accessibilityRole="button"
          accessibilityLabel={
            companions.length > 0 ? `Who was there? ${companions.join(', ')}` : 'Who was there? Tag people'
          }
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(12),
            paddingVertical: s(12),
            paddingHorizontal: s(13),
            borderRadius: s(14),
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.line,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          {companions.length > 0 ? (
            <AvatarStack people={companions.map((name) => ({ name }))} size={s(28)} ringColor={c.card} />
          ) : (
            <View style={{ width: s(32), height: s(32), borderRadius: 999, backgroundColor: c.field, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={s(16)} color={c.sec} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(13.5), lineHeight: s(17), color: c.text }}>
              Who was there?
            </ScanText>
            <ScanText numberOfLines={1} style={{ fontFamily: Fonts.inter.regular, fontSize: s(12), lineHeight: s(15), color: c.sec, marginTop: s(1) }}>
              {companions.length > 0
                ? companions.join(', ')
                : // `ready` = non-failed = matched — the exact set save will tag,
                  // and the same count the TopBar/CTA display. 0 matched (all
                  // blocked on resolve) gets a neutral string, not "all 0".
                  ready.length === 0
                  ? 'Tag people to remember who came'
                  : `Tag people on ${ready.length === 1 ? 'this ticket' : `all ${ready.length} matched tickets`}`}
            </ScanText>
          </View>
          <Icon name="chevR" size={s(16)} color={c.ter} />
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(6), marginTop: s(2) }}>
          <Icon name="check" size={s(13)} color={c.ter} />
          <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(12), color: c.ter }}>
            Only details read from your ticket are shown.
          </ScanText>
        </View>
      </ScrollView>

      {/* sticky CTA — clears the home indicator now the tab bar is hidden */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: s(14), paddingHorizontal: s(16), paddingBottom: Math.max(s(28), insets.bottom + s(14)), gap: s(10) }}>
        <LinearGradient
          colors={['transparent', c.bg]}
          locations={[0, 0.38]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          pointerEvents="none"
        />
        {blocked && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(10),
              paddingVertical: s(11),
              paddingHorizontal: s(13),
              borderRadius: s(14),
              backgroundColor: 'rgba(225,29,72,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(225,29,72,0.28)',
            }}
          >
            <View style={{ width: s(28), height: s(28), borderRadius: 999, backgroundColor: 'rgba(225,29,72,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="warn" size={s(16)} color={ScanV2Accent.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ScanText style={{ fontFamily: Fonts.inter.semibold, fontSize: s(13.5), lineHeight: s(17), color: c.text }}>
                {failed.length} ticket{failed.length === 1 ? '' : 's'} {failed.length === 1 ? "isn't" : "aren't"} matched to a movie
              </ScanText>
              <ScanText style={{ fontFamily: Fonts.inter.regular, fontSize: s(12), lineHeight: s(15), color: c.sec, marginTop: s(1) }}>
                Pick the title or remove {failed.length === 1 ? 'it' : 'them'} to save.
              </ScanText>
            </View>
          </View>
        )}
        {isSaving ? (
          <View style={{ minHeight: s(34), paddingVertical: s(9), borderRadius: 999, backgroundColor: ScanV2Accent.primary, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="small" color={ScanV2Accent.on} />
          </View>
        ) : (
          <PillButton
            full
            label={ctaLabel}
            icon={blocked ? 'warn' : undefined}
            onPress={blocked ? onResolve : onSave}
            disabled={ready.length === 0 && !blocked}
          />
        )}
      </View>
    </View>
  );
}
