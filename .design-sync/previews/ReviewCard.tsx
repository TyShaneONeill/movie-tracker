import React from 'react';
import { ReviewCard, Colors, Spacing } from '@pocketstubs/design-system';

/**
 * The row is transparent apart from its hairline divider — it inherits the feed
 * background, so the frame supplies it.
 */
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: 360,
      padding: Spacing.md,
      backgroundColor: Colors.dark.background,
      borderRadius: 12,
    }}
  >
    {children}
  </div>
);

export const Canonical = () => (
  <Frame>
    <ReviewCard
      id="rv-dune-2"
      movieTitle="Dune: Part Two"
      posterPath={null as any}
      title="Villeneuve builds cathedrals out of sand"
      reviewText="The sandworm ride is the best twelve minutes of blockbuster filmmaking since Fury Road. Zimmer's score is doing half the acting and I am not complaining."
      rating={9}
      isSpoiler={false}
      isRewatch={false}
      visibility="public"
      createdAt="2026-08-01T19:40:00Z"
      likeCount={0}
      onPress={() => {}}
    />
  </Frame>
);

export const SpoilerHidden = () => (
  <Frame>
    <ReviewCard
      id="rv-black-phone"
      movieTitle="The Black Phone"
      posterPath={null as any}
      title="That last call"
      reviewText="Everything hinges on who is actually on the other end of the line, and the movie tells you far earlier than you think."
      rating={7.5}
      isSpoiler
      isRewatch={false}
      visibility="public"
      createdAt="2026-07-29T02:15:00Z"
      likeCount={0}
      onPress={() => {}}
    />
  </Frame>
);

export const RewatchWithEdit = () => (
  <Frame>
    <ReviewCard
      id="rv-heat"
      movieTitle="Heat"
      posterPath={null as any}
      title="Fourth time, first time noticing the coffee scene blocking"
      reviewText="Mann shoots the diner like a hostage negotiation. Two men, one table, no cuts to spare."
      rating={10}
      isSpoiler={false}
      isRewatch
      visibility="public"
      createdAt="2026-07-22T23:05:00Z"
      editedAt="2026-07-23T09:12:00Z"
      likeCount={0}
      onPress={() => {}}
    />
  </Frame>
);

export const PrivateLowRating = () => (
  <Frame>
    <ReviewCard
      id="rv-morbius"
      movieTitle="Madame Web"
      posterPath={null as any}
      title="Kept for my records"
      reviewText="I watched this on a plane and the plane was the better experience."
      rating={3}
      isSpoiler={false}
      isRewatch={false}
      visibility="private"
      createdAt="2026-06-30T14:00:00Z"
      likeCount={0}
      onPress={() => {}}
      onDelete={() => {}}
    />
  </Frame>
);

export const LongTitleTruncation = () => (
  <Frame>
    <ReviewCard
      id="rv-everything"
      movieTitle="Everything Everywhere All at Once"
      posterPath={null as any}
      title="A googly eye on the void, and it works every single time"
      reviewText="The hot dog fingers universe is the emotional core and anyone who says otherwise has not sat through the credits with their mother."
      rating={8.5}
      isSpoiler={false}
      isRewatch={false}
      visibility="followers_only"
      createdAt="2026-07-11T20:30:00Z"
      likeCount={0}
      onPress={() => {}}
    />
  </Frame>
);
