/**
 * Mock data for lists
 * Reference: ui-mocks/lists.html
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
 * User's own lists
 */
export const USER_LISTS: MockList[] = [
  {
    id: '1',
    title: 'Sci-Fi Masterpieces',
    movieCount: 12,
    posterUrls: [
      'https://image.tmdb.org/t/p/w200/qhb1qOilapbapxWQn9jtRCMwXJF.jpg', // Dune: Part Two
      'https://image.tmdb.org/t/p/w200/1E5baAaEse26fej7uHkjPo37wq.jpg', // Avatar 2
      'https://image.tmdb.org/t/p/w200/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg', // Interstellar
      'https://image.tmdb.org/t/p/w200/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg', // Arrival
    ],
  },
  {
    id: '2',
    title: 'Oscars 2024',
    movieCount: 8,
    posterUrls: [
      'https://image.tmdb.org/t/p/w200/hr9rjR3J0xBBK9oi4pY5U3ZeHv7.jpg', // Oppenheimer
      'https://image.tmdb.org/t/p/w200/8UlWHLMpgZm9bx6QYh0NFoq67TZ.jpg', // Killers of the Flower Moon
    ],
  },
  {
    id: '3',
    title: 'Comfort Movies',
    movieCount: 5,
    posterUrls: [
      'https://image.tmdb.org/t/p/w200/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg', // Avatar
    ],
  },
];

/**
 * Lists liked by the user (created by other users)
 */
export const LIKED_LISTS: MockList[] = [
  {
    id: '4',
    title: 'Best of 2023',
    movieCount: 15,
    posterUrls: [
      'https://image.tmdb.org/t/p/w200/pFlaoOXp515l2i0uDLIj92JE89k.jpg', // Barbie
      'https://image.tmdb.org/t/p/w200/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', // The Holdovers
      'https://image.tmdb.org/t/p/w200/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg', // Interstellar
      'https://image.tmdb.org/t/p/w200/1E5baAaEse26fej7uHkjPo37wq.jpg', // Avatar 2
    ],
    user: {
      name: 'Sarah Jenkins',
      avatarUrl: 'https://i.pravatar.cc/150?u=a042581f4e29026024d',
    },
  },
];
