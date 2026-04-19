import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import WidgetBridge from '../modules/widget-bridge';

export type WidgetPayload = {
  version: number;
  cached_at: number;
  stats: { films_watched: number; shows_watched: number };
  shows: Array<{
    user_tv_show_id: string;
    tmdb_id: number;
    name: string;
    poster_filename: string | null;
    current_season: number;
    current_episode: number;
    total_seasons: number;
    total_episodes_in_current_season: number | null;
    episodes_by_season: Record<string, number>;
    is_season_complete: boolean;
    has_next_season: boolean;
    next_season_number: number | null;
    is_show_complete: boolean;
  }>;
};

export type AuthTokenPayload = {
  access_token: string | null;
  user_id: string | null;
  supabase_url: string;
  supabase_anon_key: string;
};

function breadcrumb(op: string, err: unknown): void {
  Sentry.addBreadcrumb({
    category: 'widget-bridge',
    level: 'warning',
    message: `${op} failed`,
    data: { error: err instanceof Error ? err.message : String(err) },
  });
}

export async function writeWidgetData(payload: WidgetPayload): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await WidgetBridge.writeWidgetData(JSON.stringify(payload));
  } catch (err) {
    breadcrumb('writeWidgetData', err);
    if (__DEV__) console.warn('[widget-bridge] writeWidgetData failed', err);
  }
}

export async function writePosterFile(filename: string, base64: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await WidgetBridge.writePosterFile(filename, base64);
  } catch (err) {
    breadcrumb('writePosterFile', err);
    if (__DEV__) console.warn('[widget-bridge] writePosterFile failed', err);
  }
}

export async function writeAuthToken(payload: AuthTokenPayload): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await WidgetBridge.writeAuthToken(JSON.stringify(payload));
  } catch (err) {
    breadcrumb('writeAuthToken', err);
    if (__DEV__) console.warn('[widget-bridge] writeAuthToken failed', err);
  }
}

export async function reloadWidgetTimelines(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await WidgetBridge.reloadWidgetTimelines();
  } catch (err) {
    breadcrumb('reloadWidgetTimelines', err);
    if (__DEV__) console.warn('[widget-bridge] reloadWidgetTimelines failed', err);
  }
}
