import { requireNativeModule } from 'expo-modules-core';

type WidgetBridgeModule = {
  writeWidgetData(json: string): Promise<void>;
  writePosterFile(filename: string, base64: string): Promise<void>;
  writeAuthToken(json: string): Promise<void>;
  reloadWidgetTimelines(): Promise<void>;
};

export default requireNativeModule<WidgetBridgeModule>('WidgetBridgeModule');
