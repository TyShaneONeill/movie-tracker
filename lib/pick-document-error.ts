// Split out of lib/pick-document.ts so classifying a copy failure doesn't
// require loading the picker itself. pick-document imports
// expo-document-picker and expo-file-system at module load; anything that
// only needs to answer "was this a copy failure?" — the TV Time error
// classifier, and its unit test — would otherwise drag both into its graph.
// This module must stay dependency-free for that to hold.

/**
 * Thrown when keepLocalCopy() reports copy.status === 'error'. A distinct
 * class (rather than a plain Error) so callers can classify this failure mode
 * with `instanceof` instead of matching on .message — see
 * components/tvtime-import/classify-read-error.ts. Never carries
 * copy.copyError (the raw NSError description, which can embed a filename —
 * PII) in its message.
 */
export class DocumentCopyError extends Error {
  constructor() {
    super('document-copy-failed');
    this.name = 'DocumentCopyError';
  }
}
