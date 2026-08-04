import React from 'react';
import { FirstTakeCard, Colors, Spacing } from '@pocketstubs/design-system';

/** Every story sits on the app background — the surface these cards ship on. */
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: 360,
      padding: Spacing.md,
      paddingBottom: 0,
      backgroundColor: Colors.dark.background,
      borderRadius: 12,
    }}
  >
    {children}
  </div>
);

export const Canonical = () => (
  <Frame>
    <FirstTakeCard
      movieTitle="Dune: Part Two"
      posterPath={null as any}
      emoji="🤯"
      quote="Walked out into the parking lot and the sky looked wrong. In a good way."
      rating={9}
      createdAt="2026-08-02T04:20:00Z"
      onPress={() => {}}
    />
  </Frame>
);

export const LatestTake = () => (
  <Frame>
    <FirstTakeCard
      movieTitle="The Black Phone"
      posterPath={null as any}
      emoji="😱"
      quote="Ethan Hawke does more with a mask on than most actors do with a monologue."
      rating={8}
      isLatest
      createdAt="2026-08-03T01:05:00Z"
      onPress={() => {}}
    />
  </Frame>
);

/**
 * Rating-only take (wordless-takes invariant): the take carries a rating and no
 * words. The quote body must not render at all — only the rating, title and meta.
 */
export const RatingOnlyNoWords = () => (
  <Frame>
    <FirstTakeCard
      movieTitle="Past Lives"
      posterPath={null as any}
      emoji="🎬"
      quote=""
      rating={7.5}
      createdAt="2026-07-31T22:45:00Z"
      onPress={() => {}}
    />
  </Frame>
);

export const SpoilerWithheld = () => (
  <Frame>
    <FirstTakeCard
      movieTitle="Sinners"
      posterPath={null as any}
      emoji="🩸"
      quote="The twist in the third act recontextualizes the whole juke joint sequence."
      rating={8.5}
      isSpoiler
      createdAt="2026-07-28T03:10:00Z"
      onPress={() => {}}
    />
  </Frame>
);

export const EpisodeScoped = () => (
  <Frame>
    <FirstTakeCard
      movieTitle="Severance"
      posterPath={null as any}
      emoji="🐐"
      quote="The goat room pays off and I owe the internet an apology."
      episodeLabel="S2 · E7"
      createdAt="2026-07-19T18:00:00Z"
      editedAt="2026-07-19T18:22:00Z"
      onPress={() => {}}
    />
  </Frame>
);

export const EmojiOnlyLongQuote = () => (
  <Frame>
    <FirstTakeCard
      movieTitle="Killers of the Flower Moon"
      posterPath={null as any}
      emoji="😐"
      quote="Three and a half hours and I would have sat for another hour, which is either a compliment to Scorsese or a confession about my weekend. Lily Gladstone holds the whole thing together with almost no dialogue."
      createdAt="2026-07-04T01:30:00Z"
      onPress={() => {}}
    />
  </Frame>
);
