export type MovieStatus = 'watchlist' | 'watching' | 'watched';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
        };
      };
      user_movies: {
        Row: {
          id: string;
          user_id: string;
          tmdb_id: number;
          status: MovieStatus;
          title: string;
          overview: string | null;
          poster_path: string | null;
          backdrop_path: string | null;
          release_date: string | null;
          vote_average: number | null;
          genre_ids: number[];
          added_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tmdb_id: number;
          status?: MovieStatus;
          title: string;
          overview?: string | null;
          poster_path?: string | null;
          backdrop_path?: string | null;
          release_date?: string | null;
          vote_average?: number | null;
          genre_ids?: number[];
          added_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tmdb_id?: number;
          status?: MovieStatus;
          title?: string;
          overview?: string | null;
          poster_path?: string | null;
          backdrop_path?: string | null;
          release_date?: string | null;
          vote_average?: number | null;
          genre_ids?: number[];
          added_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Helper types for user movies
export type UserMovie = Database['public']['Tables']['user_movies']['Row'];
export type UserMovieInsert = Database['public']['Tables']['user_movies']['Insert'];
export type UserMovieUpdate = Database['public']['Tables']['user_movies']['Update'];
