import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import type { UserList, ListMovie, UserListWithMovies } from '@/lib/database.types';

interface ListWithMoviesResponse extends UserList {
  list_movies: ListMovie[];
}

export function useUserLists() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-lists', user?.id],
    queryFn: async () => {
      // Fetch lists with movies for cover grid
      const { data: lists, error } = await supabase
        .from('user_lists')
        .select(`
          *,
          list_movies (
            id,
            list_id,
            tmdb_id,
            title,
            poster_path,
            position,
            added_at
          )
        `)
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Transform data to UserListWithMovies format
      return (lists as ListWithMoviesResponse[]).map((list) => ({
        id: list.id,
        user_id: list.user_id,
        name: list.name,
        description: list.description,
        is_public: list.is_public,
        created_at: list.created_at,
        updated_at: list.updated_at,
        movies: list.list_movies
          .sort((a, b) => a.position - b.position)
          .slice(0, 4),
        movie_count: list.list_movies.length,
      })) as UserListWithMovies[];
    },
    enabled: !!user?.id,
  });
}
