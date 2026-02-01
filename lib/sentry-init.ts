/**
 * Sentry Initialization (side-effect import)
 *
 * Import this file at the top of app/_layout.tsx to initialize Sentry
 * before any other code runs. This ensures errors during app startup
 * are captured.
 *
 * Usage: import '@/lib/sentry-init';
 */

import { initSentry } from './sentry';

initSentry();
