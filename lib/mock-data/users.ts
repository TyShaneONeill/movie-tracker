/**
 * Mock user data for frontend-first development
 * Based on ui-mocks/home.html activity feed
 */

export interface MockUser {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
  bio?: string;
  stats: {
    watched: number;
    reviews: number;
    lists: number;
  };
}

export interface MockActivity {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  timestamp: string;
  movieId: number;
  movieTitle: string;
  moviePoster: string;
  rating: number;
  reviewText?: string;
}

export const MOCK_USER: MockUser = {
  id: 'user_1',
  name: 'Alex Chen',
  username: '@alexchen',
  avatarUrl: 'https://i.pravatar.cc/300',
  bio: 'Film Enthusiast & Critic',
  stats: {
    watched: 124,
    reviews: 48,
    lists: 12,
  },
};

export const MOCK_ACTIVITY: MockActivity[] = [
  {
    id: 'activity_1',
    userId: 'user_2',
    userName: 'Sarah Jenkins',
    userAvatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d',
    timestamp: '2h ago',
    movieId: 4,
    movieTitle: 'Avatar: The Way of Water',
    moviePoster: 'https://image.tmdb.org/t/p/w200/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg',
    rating: 5,
    reviewText: 'Masterpiece',
  },
  {
    id: 'activity_2',
    userId: 'user_3',
    userName: 'Mike Ross',
    userAvatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d',
    timestamp: '5h ago',
    movieId: 7,
    movieTitle: 'Challengers',
    moviePoster: 'https://image.tmdb.org/t/p/w200/x7wF55v96F5Xf1C5v5v1e7H7.jpg',
    rating: 4,
    reviewText: 'Loved the ending',
  },
  {
    id: 'activity_3',
    userId: 'user_4',
    userName: 'Emily Chen',
    userAvatar: 'https://i.pravatar.cc/150?u=emily.chen',
    timestamp: '1d ago',
    movieId: 1,
    movieTitle: 'Dune: Part Two',
    moviePoster: 'https://image.tmdb.org/t/p/w200/1E5baAaEse26fej7uHkjPo37wq.jpg',
    rating: 5,
    reviewText: 'Absolutely stunning visuals',
  },
  {
    id: 'activity_4',
    userId: 'user_5',
    userName: 'David Park',
    userAvatar: 'https://i.pravatar.cc/150?u=david.park',
    timestamp: '1d ago',
    movieId: 5,
    movieTitle: 'Oppenheimer',
    moviePoster: 'https://image.tmdb.org/t/p/w200/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    rating: 5,
    reviewText: 'Nolan at his finest',
  },
  {
    id: 'activity_5',
    userId: 'user_6',
    userName: 'Jessica Lee',
    userAvatar: 'https://i.pravatar.cc/150?u=jessica.lee',
    timestamp: '2d ago',
    movieId: 2,
    movieTitle: 'Kung Fu Panda 4',
    moviePoster: 'https://image.tmdb.org/t/p/w200/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg',
    rating: 4,
    reviewText: 'Great family movie!',
  },
];
