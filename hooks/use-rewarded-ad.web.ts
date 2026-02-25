export function useRewardedAd() {
  return {
    loaded: false,
    loadAd: () => {},
    showAd: async () => false,
    isLoading: false,
  };
}
