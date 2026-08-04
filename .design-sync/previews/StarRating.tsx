import React from 'react';
import { StarRating, ThemedText, Colors, Typography } from '@pocketstubs/design-system';

// Inactive stars are painted in `colors.backgroundSecondary`, so the control
// only reads correctly against the app's dark background — on a light canvas
// the empty stars invert and look filled.
const Page = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: 340,
      padding: 20,
      backgroundColor: Colors.dark.background,
      boxSizing: 'border-box',
    }}
  >
    {children}
  </div>
);

const ScaleRow = ({ label, rating }: { label: string; rating: number }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
    <div style={{ width: 64 }}>
      <ThemedText style={{ ...Typography.caption.medium, color: Colors.dark.textSecondary } as any}>
        {label}
      </ThemedText>
    </div>
    <StarRating rating={rating} size={20} />
  </div>
);

/** Canonical: the interactive rating control in the review modal. */
export const ReviewModalRating = () => (
  <Page>
    <div style={{ padding: 20, backgroundColor: Colors.dark.card, borderRadius: 16 }}>
      <div style={{ marginBottom: 12, textAlign: 'center' }}>
        <ThemedText style={{ ...Typography.body.lg, color: Colors.dark.text } as any}>
          Dune: Part Two
        </ThemedText>
      </div>
      <StarRating rating={4} size={32} onRatingChange={() => {}} />
    </div>
  </Page>
);

/** Primary axis: the full 0–5 display-only scale on the app background. */
export const RatingScale = () => (
  <Page>
    <ScaleRow label="Unrated" rating={0} />
    <ScaleRow label="1 star" rating={1} />
    <ScaleRow label="2 stars" rating={2} />
    <ScaleRow label="3 stars" rating={3} />
    <ScaleRow label="4 stars" rating={4} />
    <ScaleRow label="5 stars" rating={5} />
  </Page>
);

/** Size axis: feed (16) → list row (20) → modal (32). */
export const Sizes = () => (
  <Page>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StarRating rating={4} size={16} style={{ justifyContent: 'flex-start' } as any} />
      <StarRating rating={4} size={20} style={{ justifyContent: 'flex-start' } as any} />
      <StarRating rating={4} size={32} style={{ justifyContent: 'flex-start' } as any} />
    </div>
  </Page>
);

/** Compact display-only rating as it appears beside a feed item title. */
export const InFeedItem = () => (
  <Page>
    <div
      style={{
        padding: 14,
        backgroundColor: Colors.dark.card,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <ThemedText style={{ ...Typography.body.smMedium, color: Colors.dark.text } as any}>
        The Substance
      </ThemedText>
      <StarRating rating={5} size={16} />
    </div>
  </Page>
);

/**
 * Disabled: `onRatingChange` is supplied but input is locked, so the control
 * falls back to the display-only path — identical paint, no press feedback.
 */
export const Disabled = () => (
  <Page>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ThemedText style={{ ...Typography.caption.medium, color: Colors.dark.textSecondary } as any}>
        Interactive
      </ThemedText>
      <StarRating rating={3} size={32} onRatingChange={() => {}} />
      <ThemedText style={{ ...Typography.caption.medium, color: Colors.dark.textSecondary } as any}>
        Disabled
      </ThemedText>
      <StarRating rating={3} size={32} onRatingChange={() => {}} disabled />
    </div>
  </Page>
);
