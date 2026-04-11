import { useWindowDimensions } from 'react-native';

const WIDE_BREAKPOINT = 700;
export const MAX_CONTENT_WIDTH = 720;

export function useWideLayout() {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  return { isWide, contentMaxWidth: MAX_CONTENT_WIDTH };
}
