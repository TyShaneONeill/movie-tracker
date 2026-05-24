export type TooltipPlacement = 'above' | 'below';

export interface TourStep {
  id: string;
  targetId: string;
  title: string;
  body: string;
  tooltipPlacement: TooltipPlacement;
}

// Anchor IDs registered by <TourTarget> components throughout the app.
export const TOUR_TARGETS = {
  HOME_SEARCH: 'tour:home-search',
  SCAN_TAB: 'tour:scan-tab',
  FEED_TAB: 'tour:feed-tab',
} as const;

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'track',
    targetId: TOUR_TARGETS.HOME_SEARCH,
    title: 'Track what you watch',
    body: 'Tap the search icon to find any movie or show and add it to your collection.',
    tooltipPlacement: 'below',
  },
  {
    id: 'scan',
    targetId: TOUR_TARGETS.SCAN_TAB,
    title: 'Scan a ticket',
    body: "Turn every cinema trip into a stub you'll always have. The Scan tab opens your camera.",
    tooltipPlacement: 'above',
  },
  {
    id: 'social',
    targetId: TOUR_TARGETS.FEED_TAB,
    title: 'Stay connected',
    body: 'Follow friends to see what they’re watching and reviewing. Your Feed updates as they share. Need help later? It\'s in Settings.',
    tooltipPlacement: 'above',
  },
];
