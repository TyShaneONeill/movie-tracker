import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureException } from '@/lib/sentry';

const STORAGE_KEY = '@cinetrak/recent_searches';
const MAX_RECENT_SEARCHES = 10;

export interface RecentSearch {
  id: string;
  type: 'movie' | 'person' | 'tv';
  title: string;
  subtitle: string;
  posterUrl?: string;
  tmdbId: number;
  timestamp: number;
}

interface UseRecentSearchesResult {
  recentSearches: RecentSearch[];
  isLoading: boolean;
  addRecentSearch: (search: Omit<RecentSearch, 'id' | 'timestamp'>) => Promise<void>;
  removeRecentSearch: (id: string) => Promise<void>;
  clearRecentSearches: () => Promise<void>;
}

export function useRecentSearches(): UseRecentSearchesResult {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load recent searches from storage on mount
  useEffect(() => {
    loadRecentSearches();
  }, []);

  const loadRecentSearches = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentSearch[];
        // Sort by timestamp descending (most recent first)
        parsed.sort((a, b) => b.timestamp - a.timestamp);
        setRecentSearches(parsed);
      }
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'load-recent-searches' });
    } finally {
      setIsLoading(false);
    }
  };

  const saveToStorage = async (searches: RecentSearch[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'save-recent-searches' });
    }
  };

  const addRecentSearch = useCallback(async (search: Omit<RecentSearch, 'id' | 'timestamp'>) => {
    const newSearch: RecentSearch = {
      ...search,
      id: `${search.type}-${search.tmdbId}`,
      timestamp: Date.now(),
    };

    setRecentSearches((prev) => {
      // Remove duplicate if exists (same tmdbId and type)
      const filtered = prev.filter(
        (s) => !(s.tmdbId === search.tmdbId && s.type === search.type)
      );

      // Add new search at the beginning
      const updated = [newSearch, ...filtered].slice(0, MAX_RECENT_SEARCHES);

      // Save to storage
      saveToStorage(updated);

      return updated;
    });
  }, []);

  const removeRecentSearch = useCallback(async (id: string) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const clearRecentSearches = useCallback(async () => {
    setRecentSearches([]);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'clear-recent-searches' });
    }
  }, []);

  return {
    recentSearches,
    isLoading,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
  };
}
