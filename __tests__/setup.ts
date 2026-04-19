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

// Mock @sentry/react-native (native module — not available in test environment)
jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  init: jest.fn(),
}));

// Mock expo-router (native module — not available in test environment)
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
  useSegments: jest.fn(() => []),
  useRootNavigationState: jest.fn(() => null),
  Stack: {
    Screen: jest.fn(),
  },
}));

// Mock expo-notifications (native module — not available in test environment)
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: {
    HIGH: 4,
    DEFAULT: 3,
    LOW: 2,
  },
}));

// Mock expo-device (native module — not available in test environment)
jest.mock('expo-device', () => ({
  isDevice: false,
  modelName: null,
}));

export {};
