type BannerPlacement = 'home' | 'search' | 'stats';

interface BannerAdProps {
  placement: BannerPlacement;
}

export function BannerAdComponent({ placement }: BannerAdProps) {
  return null;
}
