import React, { Suspense } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { Colors } from '@/constants/theme';

// Defer the heavy import screen (fflate unzip + parser + matcher + the file
// picker) until the route actually renders. expo-document-picker already ships
// in the production binary (see app/settings/letterboxd-import.tsx, live), and
// fflate is pure-JS — so there is NO new native module and no OTA crash risk.
// The lazy boundary is defensive: it code-splits the heavy module and keeps the
// route file itself trivial, mirroring app/(tabs)/scanner.tsx.
const TvTimeImportScreen = React.lazy(() =>
  import('@/components/tvtime-import/tvtime-import-screen').then((m) => ({ default: m.TvTimeImportScreen }))
);

export default function TvTimeImportRoute() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  return (
    <Suspense fallback={<View style={{ flex: 1, backgroundColor: colors.background }} />}>
      <TvTimeImportScreen />
    </Suspense>
  );
}
