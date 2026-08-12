// Unit coverage for the iOS full-screen document picker wrapper (issue #810
// — see lib/pick-document.ts for the freeze rationale). Mocks
// @react-native-documents/picker entirely: no native module involved.

const mockPick = jest.fn();
const mockKeepLocalCopy = jest.fn();

class MockNativeModuleError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

jest.mock('@react-native-documents/picker', () => ({
  pick: (...args: unknown[]) => mockPick(...args),
  keepLocalCopy: (...args: unknown[]) => mockKeepLocalCopy(...args),
  isErrorWithCode: (err: unknown): err is MockNativeModuleError => err instanceof MockNativeModuleError,
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
}));

import { pickDocumentIOSFullScreen } from '@/lib/pick-document';

describe('pickDocumentIOSFullScreen', () => {
  afterEach(() => {
    mockPick.mockReset();
    mockKeepLocalCopy.mockReset();
  });

  it('resolves with the cached local uri when a file is picked', async () => {
    mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
    mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri: 'file:///cache/export.zip' }]);

    const result = await pickDocumentIOSFullScreen(['public.zip-archive'], 'fallback.zip');

    expect(result).toEqual({ canceled: false, uri: 'file:///cache/export.zip' });
    expect(mockPick).toHaveBeenCalledWith({ type: ['public.zip-archive'], presentationStyle: 'fullScreen' });
    expect(mockKeepLocalCopy).toHaveBeenCalledWith({
      files: [{ uri: 'file:///picked/export.zip', fileName: 'export.zip' }],
      destination: 'cachesDirectory',
    });
  });

  it('falls back to the provided file name when the pick has none', async () => {
    mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: null }]);
    mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri: 'file:///cache/export.zip' }]);

    await pickDocumentIOSFullScreen(['public.zip-archive'], 'fallback.zip');

    expect(mockKeepLocalCopy).toHaveBeenCalledWith({
      files: [{ uri: 'file:///picked/export.zip', fileName: 'fallback.zip' }],
      destination: 'cachesDirectory',
    });
  });

  it('returns a clean canceled result when the user dismisses the picker, without surfacing an error', async () => {
    mockPick.mockRejectedValue(new MockNativeModuleError('OPERATION_CANCELED'));

    const result = await pickDocumentIOSFullScreen(['public.zip-archive'], 'fallback.zip');

    expect(result).toEqual({ canceled: true });
    expect(mockKeepLocalCopy).not.toHaveBeenCalled();
  });

  it('rethrows non-cancellation pick errors', async () => {
    mockPick.mockRejectedValue(new MockNativeModuleError('UNABLE_TO_OPEN_FILE_TYPE'));

    await expect(pickDocumentIOSFullScreen(['public.zip-archive'], 'fallback.zip')).rejects.toThrow('UNABLE_TO_OPEN_FILE_TYPE');
  });

  it('throws when keepLocalCopy reports a copy error', async () => {
    mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
    mockKeepLocalCopy.mockResolvedValue([{ status: 'error', copyError: 'disk full' }]);

    await expect(pickDocumentIOSFullScreen(['public.zip-archive'], 'fallback.zip')).rejects.toThrow('disk full');
  });
});
