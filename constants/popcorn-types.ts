export const POPCORN_ACTION_TYPES = {
  follow:       { label: 'Follow',        color: '#4CAF50' },
  like:         { label: 'Like',          color: '#FFC107' },
  add_title:    { label: 'Added Title',   color: '#2196F3' },
  first_take:   { label: 'First Take',    color: '#F44336' },
  comment:      { label: 'Comment',       color: '#9C27B0' },
  mark_watched: { label: 'Watched',       color: '#FF9800' },
  milestone:    { label: 'Milestone',     color: '#FFD700' },
} as const

export type PopcornActionType = keyof typeof POPCORN_ACTION_TYPES
