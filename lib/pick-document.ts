// Document picker wrapper for TV Time + Letterboxd import (issue #810).
//
// UIDocumentPickerViewController's default 'pageSheet' presentation wedges
// UIKit's home-indicator gesture arbitration on iOS 26/27 after dismissal
// (HomeAffordanceGestureGate), leaving the app permanently touch-dead.
// presentationStyle:'fullScreen' via @react-native-documents/picker avoids
// the handoff that triggers it — bench: 16/16 clean cycles vs 100% freeze on
// expo-document-picker's hardcoded pageSheet. Revisit (drop this wrapper,
// go back to plain expo-document-picker on iOS) once Apple fixes the OS bug.
//
// IMPORTANT: @react-native-documents/picker is NEVER statically
// imported/required at module top level, here or anywhere else in this
// codebase. Its index.js re-exports `pick`/`keepLocalCopy`/`types` from
// sibling modules that, at THEIR top level, call
// TurboModuleRegistry.getEnforcing('RNDocumentPicker') — evaluated the
// instant ANY named export is touched, not on first call. A static import
// (even just `import { types } from '...'`) crashes immediately on
// react-native-web (no TurboModuleRegistry) and on any iOS binary built
// before this dependency existed (an OTA JS update can land on such a
// binary — the 07-07 P0 pattern). requireNativePicker() below defers that
// evaluation to call time, inside a try/catch, so "module absent" degrades
// to the legacy picker instead of crashing the screen.
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

export type DocumentPickResult = { canceled: true } | { canceled: false; uri: string; file?: File };

// Apple UTI strings, inlined rather than imported from the library's
// `types` export (see the note above on why nothing from this package is
// imported statically). Each is paired with the generic 'public.item'
// fallback: files handed back by File Provider extensions (Drive, Dropbox,
// OneDrive) commonly resolve to a generic UTI rather than the specific one
// and, without the fallback, show up greyed-out/unselectable with no error.
// The old expo-document-picker MIME array's 'application/octet-stream'
// catch-all had the same permissive effect, so this preserves rather than
// narrows prior behavior.
const IOS_ZIP_TYPES = ['public.zip-archive', 'public.item'];
const IOS_CSV_TYPES = ['public.comma-separated-values-text', 'public.item'];

type NativePickerModule = typeof import('@react-native-documents/picker');

function requireNativePicker(): NativePickerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must
    // stay a runtime require(), not a static import; see the module note.
    return require('@react-native-documents/picker');
  } catch {
    return null;
  }
}

async function pickFullScreen(type: string[], fallbackFileName: string): Promise<DocumentPickResult | null> {
  const picker = requireNativePicker();
  if (!picker) return null; // native module absent (e.g. pre-#815 binary) — caller falls back to the legacy picker

  try {
    const [pickedDoc] = await picker.pick({ type, presentationStyle: 'fullScreen' });
    if (!pickedDoc) return { canceled: true }; // defensive: pick() contractually resolves with >=1 item
    const [copy] = await picker.keepLocalCopy({
      files: [{ uri: pickedDoc.uri, fileName: pickedDoc.name ?? fallbackFileName }],
      destination: 'cachesDirectory',
    });
    if (copy.status === 'error') {
      // Never surface copy.copyError (raw NSError text) to the UI — this is
      // classified as an unknown error by callers, which show their
      // existing generic copy instead of err.message.
      throw new Error('document-copy-failed');
    }
    return { canceled: false, uri: copy.localUri };
  } catch (err) {
    if (picker.isErrorWithCode(err) && err.code === picker.errorCodes.OPERATION_CANCELED) {
      return { canceled: true };
    }
    throw err;
  }
}

async function pickLegacyZip(): Promise<DocumentPickResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return { canceled: true };
  return { canceled: false, uri: result.assets[0].uri, file: result.assets[0].file };
}

async function pickLegacyCsv(): Promise<DocumentPickResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return { canceled: true };
  return { canceled: false, uri: result.assets[0].uri };
}

export async function pickTvTimeZipFile(): Promise<DocumentPickResult> {
  if (Platform.OS === 'ios') {
    const picked = await pickFullScreen(IOS_ZIP_TYPES, 'tvtime-export.zip');
    if (picked) return picked;
  }
  return pickLegacyZip();
}

export async function pickLetterboxdCsvFile(): Promise<DocumentPickResult> {
  if (Platform.OS === 'ios') {
    const picked = await pickFullScreen(IOS_CSV_TYPES, 'letterboxd-export.csv');
    if (picked) return picked;
  }
  return pickLegacyCsv();
}
