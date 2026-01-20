/**
 * Mock data for first takes (movie reviews/reactions)
 */

import type { FirstTake } from '@/lib/database.types';

// Helper to create timestamps relative to now
const now = new Date();
const minutesAgo = (mins: number) =>
  new Date(now.getTime() - mins * 60 * 1000).toISOString();
const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

export const MOCK_FIRST_TAKES: FirstTake[] = [
  {
    id: '1',
    user_id: 'user-1',
    tmdb_id: 550,
    movie_title: 'Fight Club',
    poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    reaction_emoji: '🤯',
    quote_text:
      'The ending completely rewired my brain. I need to watch this again immediately.',
    is_spoiler: false,
    created_at: minutesAgo(5),
    updated_at: minutesAgo(5),
  },
  {
    id: '2',
    user_id: 'user-1',
    tmdb_id: 680,
    movie_title: 'Pulp Fiction',
    poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
    reaction_emoji: '😎',
    quote_text:
      'Pure cinema. Every scene is iconic. Tarantino at his absolute best.',
    is_spoiler: false,
    created_at: hoursAgo(3),
    updated_at: hoursAgo(3),
  },
  {
    id: '3',
    user_id: 'user-1',
    tmdb_id: 155,
    movie_title: 'The Dark Knight',
    poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    reaction_emoji: '🦇',
    quote_text:
      'Heath Ledger deserved every award. This transcends the superhero genre.',
    is_spoiler: false,
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
  },
  {
    id: '4',
    user_id: 'user-1',
    tmdb_id: 27205,
    movie_title: 'Inception',
    poster_path: '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
    reaction_emoji: '🌀',
    quote_text:
      'My mind is still spinning. Nolan created a masterpiece of layered storytelling.',
    is_spoiler: false,
    created_at: daysAgo(3),
    updated_at: daysAgo(3),
  },
  {
    id: '5',
    user_id: 'user-1',
    tmdb_id: 278,
    movie_title: 'The Shawshank Redemption',
    poster_path: '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg',
    reaction_emoji: '🥹',
    quote_text:
      'Hope is a beautiful thing. This movie restored my faith in storytelling.',
    is_spoiler: false,
    created_at: daysAgo(7),
    updated_at: daysAgo(7),
  },
];
