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
import * as FileSystem from 'expo-file-system/legacy';

export type DocumentPickResult =
  | { canceled: true }
  | {
      canceled: false;
      uri: string;
      file?: File;
      // What releasePickedDocument() deletes once the caller is done reading.
      // Distinct from `uri` because the native picker puts its copy inside a
      // directory it created for this pick alone, and the directory is what
      // has to go. Undefined on web, where the pick is an in-memory File on a
      // blob: uri and nothing was written to disk.
      cleanupUri?: string;
    };

// Lives in its own module so error classifiers can import it without pulling
// the picker's dependencies in with it. Re-exported here because this is
// where it's thrown, and where callers expect to find it.
import { DocumentCopyError } from './pick-document-error';

export { DocumentCopyError };

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

// Best-effort removal of a picked file or the directory holding it. Never
// rejects — not even if deleteAsync throws synchronously — so a failure here
// can't mask whatever the caller was already reporting. Never logs either:
// the path embeds the user's chosen filename.
async function discard(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Intentionally swallowed; see above.
  }
}

// keepLocalCopy() creates a fresh Caches/<UUID>/ directory per call and moves
// the pick into it (the package's ios/swift/FileOperations.swift, moveFiles).
// Deleting just the file leaves that directory behind forever, and since we
// only ever pass one file per call it holds nothing else — so the directory
// is the cleanup target.
//
// But only when we can positively identify it as one of those directories.
// The delete is recursive, so mistaking a shared parent — cachesDirectory
// itself, worst case — for a per-pick one would take unrelated app state with
// it. Matching the shape of the UUID the native side generates fails closed:
// anything else falls back to deleting just the file, which is what main did,
// and whose worst case is the empty directory this is trying to stop leaking.
const PER_PICK_DIRECTORY_NAME = /^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i;

function containingDirectory(fileUri: string): string {
  const lastSlash = fileUri.lastIndexOf('/');
  if (lastSlash < 0) return fileUri;
  const parent = fileUri.slice(0, lastSlash);
  const parentName = parent.slice(parent.lastIndexOf('/') + 1);
  return PER_PICK_DIRECTORY_NAME.test(parentName) ? parent : fileUri;
}

// expo-document-picker's copyToCacheDirectory writes into a directory it
// shares across picks, so on the legacy path the file itself is the cleanup
// target. On web there is no on-disk copy to clean up at all.
function legacyCleanupUri(uri: string): string | undefined {
  return Platform.OS === 'web' ? undefined : uri;
}

/**
 * Deletes the picker's on-disk copy of a pick. Callers must call this once
 * they're done reading it — for TV Time that copy is the export ZIP, which
 * carries the account's auth-token / password-hash CSVs and must not linger
 * at rest. Accepts any DocumentPickResult (cancellations and web picks are
 * no-ops) and never rejects, so it drops straight into a `finally`.
 */
export async function releasePickedDocument(picked: DocumentPickResult): Promise<void> {
  if (picked.canceled || !picked.cleanupUri) return;
  await discard(picked.cleanupUri);
}

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

  // Set the instant keepLocalCopy() reports success, so the catch below can
  // delete the copy if anything after that throws. Nothing sits between the
  // assignment and the return today, but a copy this function throws away
  // rather than returns is one the caller can never clean up — it has no uri
  // to delete — and for TV Time that copy is the export's credential CSVs
  // sitting in cache at rest (issue #816). Ownership lives here so a future
  // step added below can't quietly reopen that gap.
  let copiedDir: string | null = null;
  try {
    const [pickedDoc] = await picker.pick({ type, presentationStyle: 'fullScreen' });
    if (!pickedDoc) return { canceled: true }; // defensive: pick() contractually resolves with >=1 item
    const [copy] = await picker.keepLocalCopy({
      files: [{ uri: pickedDoc.uri, fileName: pickedDoc.name ?? fallbackFileName }],
      destination: 'cachesDirectory',
    });
    if (copy.status === 'error') {
      // Nothing to clean up on this path, and nothing we could clean up if
      // there were: the native side creates the destination directory and
      // then moves the file into it, so a reported error means the move
      // failed and only an empty directory remains — whose path is never
      // returned to JS (FileOperations.swift, moveFiles/moveSingleFile). It
      // holds no file content and is left to OS cache eviction.
      //
      // Never surface copy.copyError (raw NSError text, which can embed a
      // filename) anywhere — not in this thrown error's message, and
      // callers must not forward err.message either. DocumentCopyError lets
      // callers classify this failure mode (e.g. Sentry code) without
      // touching the raw text.
      throw new DocumentCopyError();
    }
    copiedDir = containingDirectory(copy.localUri);
    return { canceled: false, uri: copy.localUri, cleanupUri: copiedDir };
  } catch (err) {
    if (copiedDir) await discard(copiedDir);
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
  const asset = result.assets[0];
  return { canceled: false, uri: asset.uri, file: asset.file, cleanupUri: legacyCleanupUri(asset.uri) };
}

async function pickLegacyCsv(): Promise<DocumentPickResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return { canceled: true };
  const asset = result.assets[0];
  return { canceled: false, uri: asset.uri, cleanupUri: legacyCleanupUri(asset.uri) };
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
