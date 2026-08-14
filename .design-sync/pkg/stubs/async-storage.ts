// Preview-only stub replacing @react-native-async-storage/async-storage.
const AsyncStorage = {
  getItem: async (_k: string) => null as string | null,
  setItem: async (_k: string, _v: string) => {},
  removeItem: async (_k: string) => {},
  clear: async () => {},
  getAllKeys: async () => [] as string[],
};
export default AsyncStorage;
