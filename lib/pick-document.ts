// iOS-only document picker wrapper — issue #810: UIDocumentPickerViewController's
// default 'pageSheet' presentation wedges UIKit gesture arbitration on iOS
// 26/27 after dismissal (HomeAffordanceGestureGate), leaving the app
// permanently touch-dead. presentationStyle:'fullScreen' avoids the
// home-indicator handoff that triggers it — bench: 16/16 clean cycles vs
// 100% freeze on the old expo-document-picker path (issue #810). Remove this
// wrapper and go back to expo-document-picker on iOS once Apple fixes the OS
// bug.
//
// keepLocalCopy(..., 'cachesDirectory') mirrors expo-document-picker's
// copyToCacheDirectory:true so callers keep their existing read-then-delete
// semantics unchanged.
import { pick, keepLocalCopy, isErrorWithCode, errorCodes, type PredefinedFileTypes } from '@react-native-documents/picker';

export type IOSDocumentPickResult = { canceled: true } | { canceled: false; uri: string };

export async function pickDocumentIOSFullScreen(
  type: Array<PredefinedFileTypes | string>,
  fallbackFileName: string
): Promise<IOSDocumentPickResult> {
  try {
    const [pickedDoc] = await pick({ type, presentationStyle: 'fullScreen' });
    const [copy] = await keepLocalCopy({
      files: [{ uri: pickedDoc.uri, fileName: pickedDoc.name ?? fallbackFileName }],
      destination: 'cachesDirectory',
    });
    if (copy.status === 'error') throw new Error(copy.copyError);
    return { canceled: false, uri: copy.localUri };
  } catch (err) {
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
      return { canceled: true };
    }
    throw err;
  }
}
