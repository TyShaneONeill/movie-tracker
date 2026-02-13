// Shared test setup

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    },
  },
}));

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock expo-linking
jest.mock('expo-linking', () => ({
  parse: jest.fn((url: string) => {
    try {
      const u = new URL(url);
      return { path: u.pathname.replace(/^\//, ''), queryParams: {} };
    } catch {
      return { path: null, queryParams: {} };
    }
  }),
}));

// Mock sentry
jest.mock('@/lib/sentry', () => ({
  captureException: jest.fn(),
}));

export {};
