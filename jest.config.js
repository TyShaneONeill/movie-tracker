module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|@supabase/supabase-js|@tanstack/react-query|react-native-toast-message|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|expo-image|expo-image-picker|expo-haptics|expo-linking|expo-constants|expo-secure-store|expo-font|expo-splash-screen|expo-router|expo-crypto|expo-linear-gradient|expo-blur|expo-web-browser|expo-auth-session|expo-modules-core)/)',
  ],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/supabase/'],
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    '!lib/database.types.ts',
    '!lib/tmdb.types.ts',
    '!lib/mock-data/**',
    '!**/*.d.ts',
  ],
};
