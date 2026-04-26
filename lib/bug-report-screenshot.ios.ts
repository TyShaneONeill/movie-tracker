import { captureScreen } from 'react-native-view-shot';

export async function captureBugReportScreenshot(): Promise<string | null> {
  try {
    const uri = await captureScreen({ format: 'png', quality: 0.8, result: 'base64' });
    return uri;
  } catch {
    return null;
  }
}
