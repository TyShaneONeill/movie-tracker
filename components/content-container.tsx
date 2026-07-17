import { View, StyleSheet, Platform } from 'react-native';
import { useWideLayout, MAX_CONTENT_WIDTH } from '@/hooks/use-wide-layout';
import type { ReactNode } from 'react';

/**
 * The app's "focused single-task form" web width cap. Nests INSIDE
 * ContentContainer's wider outer cap (MAX_CONTENT_WIDTH, 720px) to narrow a
 * form/flow column to a comfortable reading width on desktop. This is the exact
 * object copy-pasted across the settings family (change-password, delete-account,
 * subscription, …); exported here so screens import it instead of re-declaring it.
 * Empty object on native — layout is untouched off web by construction.
 */
export const formWidthStyle = Platform.OS === 'web'
  ? ({ maxWidth: 500, width: '100%', alignSelf: 'center' } as const)
  : ({} as const);

interface ContentContainerProps {
  children: ReactNode;
  style?: object;
}

export function ContentContainer({ children, style }: ContentContainerProps) {
  const { isWide } = useWideLayout();
  if (!isWide) return <>{children}</>;
  return (
    <View style={[styles.container, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
});
