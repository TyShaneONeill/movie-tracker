import React from 'react';
import { AchievementBadge, ThemedText, Colors, Typography } from '@pocketstubs/design-system';

// Each badge is a fixed 72px-wide column (56px circle + wrapped caption), so
// the shelf wrapper is sized to hold a full row without collapsing.
const Shelf = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: '100%',
      minHeight: 100,
      padding: 16,
      backgroundColor: Colors.dark.card,
      borderRadius: 16,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'flex-start',
    }}
  >
    {children}
  </div>
);

const Shelf340 = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 340, padding: 12, backgroundColor: Colors.dark.background, boxSizing: 'border-box' }}>
    <Shelf>{children}</Shelf>
  </div>
);

/** Canonical: a single unlocked badge — rose-tinted ring, full opacity. */
export const Unlocked = () => (
  <div
    style={{
      width: 340,
      minHeight: 110,
      display: 'flex',
      justifyContent: 'center',
      paddingTop: 20,
      paddingBottom: 20,
      backgroundColor: Colors.dark.background,
      boxSizing: 'border-box',
    }}
  >
    <AchievementBadge icon="🎬" name="First Take" unlocked onPress={() => {}} />
  </div>
);

/** Primary axis: unlocked vs locked (locked drops to 40% opacity, muted ring + caption). */
export const UnlockedVsLocked = () => (
  <Shelf340>
    <AchievementBadge icon="🎬" name="First Take" unlocked onPress={() => {}} />
    <AchievementBadge icon="🎟️" name="Opening Night" unlocked onPress={() => {}} />
    <AchievementBadge icon="🏆" name="Weekend Marathon" unlocked={false} onPress={() => {}} />
    <AchievementBadge icon="🌍" name="Genre Explorer" unlocked={false} onPress={() => {}} />
  </Shelf340>
);

/** Leveled badges carry a gold level pip at the bottom-right of the ring. */
export const Leveled = () => (
  <Shelf340>
    <AchievementBadge icon="🍿" name="Popcorn Streak" unlocked currentLevel={3} maxLevel={5} onPress={() => {}} />
    <AchievementBadge icon="🎟️" name="Stub Collector" unlocked currentLevel={7} maxLevel={10} onPress={() => {}} />
    <AchievementBadge icon="🎭" name="Double Feature" unlocked currentLevel={1} maxLevel={5} onPress={() => {}} />
    <AchievementBadge icon="🦇" name="Midnight Screening" unlocked={false} currentLevel={0} maxLevel={5} onPress={() => {}} />
  </Shelf340>
);

/** The profile achievement shelf as it ships — mixed states, long names wrapping to 2 lines. */
export const ProfileShelf = () => (
  <Shelf340>
    <AchievementBadge icon="🎬" name="First Take" unlocked onPress={() => {}} />
    <AchievementBadge icon="🍿" name="Popcorn Streak" unlocked currentLevel={4} maxLevel={5} onPress={() => {}} />
    <AchievementBadge icon="🎟️" name="Stub Collector" unlocked currentLevel={2} maxLevel={10} onPress={() => {}} />
    <AchievementBadge icon="🏆" name="Weekend Marathon" unlocked={false} onPress={() => {}} />
    <AchievementBadge icon="🌍" name="Genre Explorer" unlocked={false} onPress={() => {}} />
    <AchievementBadge icon="🦇" name="Midnight Screening" unlocked={false} onPress={() => {}} />
  </Shelf340>
);

/** Caption truncation: names clamp to two lines inside the 72px column. */
export const LongNames = () => (
  <div style={{ width: 340, padding: 16, backgroundColor: Colors.dark.background, boxSizing: 'border-box' }}>
    <div style={{ marginBottom: 10 }}>
      <ThemedText style={{ ...Typography.caption.medium, color: Colors.dark.textSecondary } as any}>
        Names clamp at two lines
      </ThemedText>
    </div>
    <Shelf>
      <AchievementBadge icon="🎞️" name="Completed a Full Director Retrospective" unlocked onPress={() => {}} />
      <AchievementBadge icon="⭐" name="Rated One Hundred Movies" unlocked currentLevel={5} maxLevel={5} onPress={() => {}} />
    </Shelf>
  </div>
);
