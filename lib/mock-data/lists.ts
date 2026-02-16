/**
 * Mock data for user lists
 * Reference: ui-mocks/lists.html
 */

import type { UserListWithMovies, ListMovie } from '@/lib/database.types';

/**
 * Mock user lists with movies for development
 */
export const MOCK_USER_LISTS: UserListWithMovies[] = [
  {
    id: '1',
    user_id: 'user-1',
    name: 'All-Time Favorites',
    description: 'Movies I can watch over and over again',
    is_public: true,
    cover_image_url: null,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-20T00:00:00Z',
    movie_count: 24,
    movies: [
      { id: '1', list_id: '1', tmdb_id: 550, title: 'Fight Club', poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', position: 0, notes: null, added_at: '2024-01-15T00:00:00Z' },
      { id: '2', list_id: '1', tmdb_id: 680, title: 'Pulp Fiction', poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', position: 1, notes: null, added_at: '2024-01-15T00:00:00Z' },
      { id: '3', list_id: '1', tmdb_id: 155, title: 'The Dark Knight', poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg', position: 2, notes: null, added_at: '2024-01-15T00:00:00Z' },
      { id: '4', list_id: '1', tmdb_id: 27205, title: 'Inception', poster_path: '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg', position: 3, notes: null, added_at: '2024-01-15T00:00:00Z' },
    ],
  },
  {
    id: '2',
    user_id: 'user-1',
    name: 'Weekend Comfort Watches',
    description: 'Perfect for lazy Sunday afternoons',
    is_public: false,
    cover_image_url: null,
    created_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-01-18T00:00:00Z',
    movie_count: 12,
    movies: [
      { id: '5', list_id: '2', tmdb_id: 508442, title: 'Soul', poster_path: '/hm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg', position: 0, notes: null, added_at: '2024-01-10T00:00:00Z' },
      { id: '6', list_id: '2', tmdb_id: 862, title: 'Toy Story', poster_path: '/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg', position: 1, notes: null, added_at: '2024-01-10T00:00:00Z' },
    ],
  },
  {
    id: '3',
    user_id: 'user-1',
    name: '2024 Watchlist',
    description: null,
    is_public: true,
    cover_image_url: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-05T00:00:00Z',
    movie_count: 8,
    movies: [],
  },
];

/**
 * Legacy mock list interface for backwards compatibility
 * @deprecated Use UserListWithMovies instead
 */
export interface MockList {
  id: string;
  title: string;
  movieCount: number;
  posterUrls: string[];
  user?: {
    name: string;
    avatarUrl: string;
  };
}

/**
 * User's own lists (legacy format)
 * @deprecated Use MOCK_USER_LISTS instead
 */
export const USER_LISTS: MockList[] = [
  {
    id: '1',
    title: 'Sci-Fi Masterpieces',
    movieCount: 12,
    posterUrls: [
      'https://image.tmdb.org/t/p/w200/qhb1qOilapbapxWQn9jtRCMwXJF.jpg',
      'https://image.tmdb.org/t/p/w200/1E5baAaEse26fej7uHkjPo37wq.jpg',
      'https://image.tmdb.org/t/p/w200/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg',
      'https://image.tmdb.org/t/p/w200/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
    ],
  },
  {
    id: '2',
    title: 'Oscars 2024',
    movieCount: 8,
    posterUrls: [
      'https://image.tmdb.org/t/p/w200/hr9rjR3J0xBBK9oi4pY5U3ZeHv7.jpg',
      'https://image.tmdb.org/t/p/w200/8UlWHLMpgZm9bx6QYh0NFoq67TZ.jpg',
    ],
  },
  {
    id: '3',
    title: 'Comfort Movies',
    movieCount: 5,
    posterUrls: [
      'https://image.tmdb.org/t/p/w200/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg',
    ],
  },
];

/**
 * Lists liked by the user (legacy format)
 */
export const LIKED_LISTS: MockList[] = [
  {
    id: '4',
    title: 'Best of 2023',
    movieCount: 15,
    posterUrls: [
      'https://image.tmdb.org/t/p/w200/pFlaoOXp515l2i0uDLIj92JE89k.jpg',
      'https://image.tmdb.org/t/p/w200/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
      'https://image.tmdb.org/t/p/w200/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg',
      'https://image.tmdb.org/t/p/w200/1E5baAaEse26fej7uHkjPo37wq.jpg',
    ],
    user: {
      name: 'Sarah Jenkins',
      avatarUrl: 'https://i.pravatar.cc/150?u=a042581f4e29026024d',
    },
  },
];
