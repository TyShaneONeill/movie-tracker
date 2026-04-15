export const POPCORN_ACTION_TYPES = {
  follow:       { label: 'Follow',       color: '#4CAF50', threshold: 1  },
  like:         { label: 'Like',         color: '#FFC107', threshold: 50 },
  add_title:    { label: 'Added Title',  color: '#2196F3', threshold: 1  },
  first_take:   { label: 'First Take',   color: '#F44336', threshold: 10 },
  comment:      { label: 'Comment',      color: '#9C27B0', threshold: 10 },
  mark_watched: { label: 'Watched',      color: '#EDE3C4', threshold: 1  },
  milestone:    { label: 'Milestone',    color: '#FFD700', threshold: 1  },
} as const

export type PopcornActionType = keyof typeof POPCORN_ACTION_TYPES
