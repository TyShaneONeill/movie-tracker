/**
 * Mock movie data for frontend-first development
 * Uses TMDB image URLs from ui-mocks
 */

export interface MockMovie {
  id: number;
  title: string;
  posterPath: string;
  backdropPath?: string;
  genre: string;
  rating: number;
  year?: string;
  runtime?: string;
  overview?: string;
}

export const TRENDING_MOVIES: MockMovie[] = [
  {
    id: 1,
    title: 'Dune: Part Two',
    posterPath: 'https://image.tmdb.org/t/p/w500/1E5baAaEse26fej7uHkjPo37wq.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w780/1E5baAaEse26fej7uHkjPo37wq.jpg',
    genre: 'Sci-Fi',
    rating: 9.0,
    year: '2024',
    runtime: '166 min',
    overview: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
  },
  {
    id: 2,
    title: 'Kung Fu Panda 4',
    posterPath: 'https://image.tmdb.org/t/p/w500/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w780/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg',
    genre: 'Animation',
    rating: 7.8,
    year: '2024',
    runtime: '94 min',
    overview: 'Po must train a new Dragon Warrior while facing a shapeshifting sorceress.',
  },
  {
    id: 3,
    title: 'Dune',
    posterPath: 'https://image.tmdb.org/t/p/w500/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w780/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
    genre: 'Sci-Fi',
    rating: 8.5,
    year: '2021',
    runtime: '155 min',
    overview: 'A noble family becomes embroiled in a war for control over the galaxy\'s most valuable asset.',
  },
  {
    id: 4,
    title: 'Avatar: The Way of Water',
    posterPath: 'https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w780/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg',
    genre: 'Sci-Fi',
    rating: 7.6,
    year: '2022',
    runtime: '192 min',
    overview: 'Jake Sully and Ney\'tiri have formed a family and are doing everything to stay together.',
  },
  {
    id: 5,
    title: 'Oppenheimer',
    posterPath: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w780/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    genre: 'Drama',
    rating: 8.3,
    year: '2023',
    runtime: '180 min',
    overview: 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.',
  },
  {
    id: 6,
    title: 'The Batman',
    posterPath: 'https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg',
    backdropPath: 'https://image.tmdb.org/t/p/w780/74xTEgt7R36Fpooo50r9T25onhq.jpg',
    genre: 'Action',
    rating: 7.8,
    year: '2022',
    runtime: '176 min',
    overview: 'When a sadistic serial killer begins murdering key political figures in Gotham, Batman is forced to investigate.',
  },
];

export const SEARCH_RESULTS: MockMovie[] = [
  {
    id: 101,
    title: 'The Shawshank Redemption',
    posterPath: 'https://image.tmdb.org/t/p/w200/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
    genre: 'Drama',
    rating: 9.3,
    year: '1994',
  },
  {
    id: 102,
    title: 'The Godfather',
    posterPath: 'https://image.tmdb.org/t/p/w200/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
    genre: 'Crime',
    rating: 9.2,
    year: '1972',
  },
  {
    id: 103,
    title: 'The Dark Knight',
    posterPath: 'https://image.tmdb.org/t/p/w200/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    genre: 'Action',
    rating: 9.0,
    year: '2008',
  },
  {
    id: 104,
    title: 'Pulp Fiction',
    posterPath: 'https://image.tmdb.org/t/p/w200/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
    genre: 'Crime',
    rating: 8.9,
    year: '1994',
  },
];

/**
 * Mock collection movies for profile screen
 * Based on ui-mocks/profile.html collection grid
 */
export const COLLECTION_MOVIES: MockMovie[] = [
  {
    id: 201,
    title: 'Zootopia 2',
    posterPath: 'https://image.tmdb.org/t/p/w500/pxv61t1jh2BwkgqZ68t7r6v8q.jpg',
    genre: 'Animation',
    rating: 8.2,
    year: '2024',
  },
  {
    id: 202,
    title: 'Kung Fu Panda 4',
    posterPath: 'https://image.tmdb.org/t/p/w200/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg',
    genre: 'Animation',
    rating: 7.8,
    year: '2024',
  },
  {
    id: 203,
    title: 'Dune',
    posterPath: 'https://image.tmdb.org/t/p/w200/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
    genre: 'Sci-Fi',
    rating: 8.5,
    year: '2021',
  },
  {
    id: 204,
    title: 'Avatar: The Way of Water',
    posterPath: 'https://image.tmdb.org/t/p/w200/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg',
    genre: 'Sci-Fi',
    rating: 7.6,
    year: '2022',
  },
  {
    id: 205,
    title: 'Challengers',
    posterPath: 'https://image.tmdb.org/t/p/w200/hr9rjR3J0xBBK9oi4pY5U3ZeHv7.jpg',
    genre: 'Drama',
    rating: 7.3,
    year: '2024',
  },
  {
    id: 206,
    title: 'Godzilla x Kong',
    posterPath: 'https://image.tmdb.org/t/p/w200/8UlWHLMpgZm9bx6QYh0NFoq67TZ.jpg',
    genre: 'Action',
    rating: 6.8,
    year: '2024',
  },
  {
    id: 207,
    title: 'Ghostbusters: Frozen Empire',
    posterPath: 'https://image.tmdb.org/t/p/w200/qhb1qOilapbapxWQn9jtRCMwXJF.jpg',
    genre: 'Comedy',
    rating: 6.5,
    year: '2024',
  },
  {
    id: 208,
    title: 'The Godfather',
    posterPath: 'https://image.tmdb.org/t/p/w200/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
    genre: 'Crime',
    rating: 9.2,
    year: '1972',
  },
  {
    id: 209,
    title: 'Inside Out 2',
    posterPath: 'https://image.tmdb.org/t/p/w200/pFlaoOXp515l2i0uDLIj92JE89k.jpg',
    genre: 'Animation',
    rating: 7.9,
    year: '2024',
  },
];

/**
 * Helper to get TMDB image URL with size parameter
 */
export function getTMDBImageUrl(path: string, size: 'w200' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'): string {
  if (path.startsWith('http')) {
    return path;
  }
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
