import { View, StyleSheet } from 'react-native';
import { useWideLayout, MAX_CONTENT_WIDTH } from '@/hooks/use-wide-layout';
import type { ReactNode } from 'react';

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
