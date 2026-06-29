/**
 * Ticket Scan v2 — flow controller.
 *
 * Stage host for the redesigned capture -> review -> save journey, mounted by
 * the scanner tab gate when the `ticket_scan_v2` flag is on. Owns the captured
 * tickets, scan-status, and post-save navigation. Capture wires to the EXISTING
 * `useScanTicket().scanTicket` path; save wires to the extracted
 * `saveTicketsToJourney`. After save, when the user's `firstTakePromptEnabled`
 * pref is on, the First Take wizard (`FirstTakeSheet`) runs over the saved
 * movies and applies the post-save nav on finish/abandon; with the pref off we
 * route immediately to the existing destination (single matched -> journey
 * card; else profile).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Platform, Linking } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ParamListBase } from '@react-navigation/native';
import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';

import { ScanV2Colors } from '@/constants/scan-v2-theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';
import { useAchievementCheck } from '@/lib/achievement-context';
import { useScanTicket, fetchScanStatus, type ProcessedScanResult } from '@/hooks/use-scan-ticket';
import { imageUriToBase64, getMimeTypeFromUri } from '@/lib/image-utils';
import { captureException } from '@/lib/sentry';
import { GuestSignInPrompt } from '@/components/guest-sign-in-prompt';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { saveTicketsToJourney, type SavedMovie } from '@/lib/scan-save';
import {
  toScanTicketItems,
  toTicketVM,
  type ScanTicketItem,
} from '@/lib/scan-v2/ticket-view-model';
import type { ProcessedTicket, TMDBMatch } from '@/lib/ticket-processor';
import type { TMDBMovie } from '@/lib/tmdb.types';

import { ScreenCamera } from './screen-camera';
import { ScreenPermission } from './screen-permission';
import { ScreenReview } from './screen-review';
import { ScreenUnable } from './screen-unable';
import { ResolveDialog } from './resolve-dialog';
import { EditSheet } from './edit-sheet';
import { FirstTakeSheet } from './first-take-sheet';

type Stage = 'camera' | 'permission' | 'unable' | 'review';

export function ScanV2Flow() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();
  const { triggerAchievementCheck } = useAchievementCheck();
  const { scanTicket, isScanning } = useScanTicket();
  const { preferences } = useUserPreferences();
  const [permission, requestPermission] = useCameraPermissions();
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();

  // Full-screen takeover: the v2 flow covers the bottom CTAs and shutter row, so
  // the parent tab bar must be hidden on every v2 stage (camera/review/unable/
  // permission) and restored on blur/unmount. Gated on `flowActive` so the guest
  // sign-in prompt — which still needs tab navigation — keeps the bar. The v1
  // scanner never mounts this flow, so with the flag off the tab bar is untouched.
  const flowActive = !!user && !isAuthLoading;
  useFocusEffect(
    useCallback(() => {
      if (!flowActive) return;
      navigation.setOptions({ tabBarStyle: { display: 'none' } });
      return () => navigation.setOptions({ tabBarStyle: undefined });
    }, [navigation, flowActive])
  );

  const [stage, setStage] = useState<Stage>('camera');
  const [items, setItems] = useState<ScanTicketItem[]>([]);
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [showDupNotice, setShowDupNotice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // After save, when the First Take pref is on, the wizard runs over the saved
  // movies; `firstId` carries the single-movie nav target. Null = no wizard.
  const [firstTake, setFirstTake] = useState<{ movies: SavedMovie[]; firstId: number | null } | null>(null);

  // Request camera permission once on mount if we can still ask.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Fetch scan status when authenticated (mirrors v1 scanner).
  useEffect(() => {
    if (user && !isAuthLoading) {
      fetchScanStatus()
        .then((status) => setScansRemaining(status.scansRemaining))
        .catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), { context: 'scan-v2-fetch-scan-status' });
          setScansRemaining(3);
        });
    } else if (!user && !isAuthLoading) {
      setScansRemaining(3);
    }
  }, [user, isAuthLoading]);

  const vms = useMemo(() => items.map(toTicketVM), [items]);
  const failedVms = vms.filter((v) => v.status === 'failed');
  const readyCount = vms.length - failedVms.length;

  const editingItem = editingId ? items.find((i) => i.id === editingId) ?? null : null;
  const editingVM = editingId ? vms.find((v) => v.id === editingId) ?? null : null;

  const handleSaveEdit = useCallback(
    (updated: ProcessedTicket) => {
      setItems((prev) => prev.map((i) => (i.id === editingId ? { ...i, ticket: updated } : i)));
      setEditingId(null);
    },
    [editingId]
  );

  const appendResult = useCallback((result: ProcessedScanResult) => {
    setScansRemaining(result.scansRemaining);
    if (result.duplicatesRemoved > 0) {
      setDuplicatesRemoved((d) => d + result.duplicatesRemoved);
      setShowDupNotice(true);
    }
    const newItems = toScanTicketItems(result.tickets);
    setItems((prev) => [...prev, ...newItems]);
    return newItems.length;
  }, []);

  const runScan = useCallback(
    async (base64: string, mimeType: string): Promise<number> => {
      try {
        const result = await scanTicket(base64, mimeType);
        const added = appendResult(result);
        if (added === 0 && items.length === 0) {
          setStage('unable');
        }
        return added;
      } catch (err) {
        // scanTicket already surfaces a user-facing error; if nothing has been
        // captured yet, drop to the "couldn't read" state.
        captureException(err instanceof Error ? err : new Error(String(err)), { context: 'scan-v2-run-scan' });
        if (items.length === 0) setStage('unable');
        return 0;
      }
    },
    [scanTicket, appendResult, items.length]
  );

  const handleShutter = useCallback(
    (base64: string, mimeType: string) => {
      runScan(base64, mimeType);
    },
    [runScan]
  );

  // Rewarded-ad bonus scan — parity with v1 scanner's `handleAdReward`. Granted
  // after the user watches a rewarded ad (wired from the camera screen bubble).
  const handleEarnScan = useCallback(async () => {
    if (!user) return;
    const { error: rpcError } = await supabase.rpc('increment_bonus_scans', {
      p_user_id: user.id,
    });
    if (rpcError) {
      captureException(new Error(rpcError.message), { context: 'scan-v2-increment-bonus-scans' });
      return;
    }
    analytics.track('scan:bonus_granted');
    const status = await fetchScanStatus();
    setScansRemaining(status.scansRemaining);
  }, [user]);

  const handleUpload = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Automatic,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const base64 = await imageUriToBase64(asset.uri);
      const mimeType = asset.mimeType || getMimeTypeFromUri(asset.uri);
      const added = await runScan(base64, mimeType);
      // From the permission fallback (no live camera / no batch tray), a
      // successful upload should advance straight to review.
      if (added > 0 && !permission?.granted) {
        setStage('review');
      }
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), { context: 'scan-v2-upload' });
    }
  }, [runScan, permission?.granted]);

  const handleClose = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.navigate('/(tabs)/profile');
  }, []);

  const handleContinue = useCallback(() => {
    setStage(items.length === 0 ? 'unable' : 'review');
  }, [items.length]);

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      if (next.length === 0) {
        setShowResolve(false);
        setStage('camera');
      }
      return next;
    });
  }, []);

  const handleResolveTicket = useCallback((id: string, movie: TMDBMovie) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const tmdbMatch: TMDBMatch = {
          movie,
          confidence: 1,
          matchedTitle: movie.title,
          originalTitle: i.ticket.movieTitle || '',
        };
        const ticket: ProcessedTicket = { ...i.ticket, tmdbMatch, processingErrors: [], wasModified: true };
        return { ...i, ticket };
      })
    );
  }, []);

  const openSettings = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') await Linking.openURL('app-settings:');
      else if (Platform.OS === 'android') await Linking.openSettings();
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), { context: 'scan-v2-open-settings' });
    }
  }, []);

  // Post-save navigation contract: single saved movie -> its journey card; else
  // the profile. Shared by the immediate path (First Take pref off) and the
  // wizard's finish/abandon path.
  const navigateAfterSave = useCallback((movies: SavedMovie[], firstId: number | null) => {
    if (movies.length === 1 && firstId != null) {
      router.replace(`/journey/movie/${firstId}`);
    } else {
      router.replace('/(tabs)/profile');
    }
  }, []);

  const firstTakePromptEnabled = preferences?.firstTakePromptEnabled ?? true;

  const handleSave = useCallback(async () => {
    if (!user) return;
    setShowResolve(false);
    setIsSaving(true);
    try {
      const result = await saveTicketsToJourney(
        items.map((i) => i.ticket),
        user,
        queryClient,
        triggerAchievementCheck
      );
      // With the First Take pref on and at least one saved movie, run the wizard
      // over the saved movies; it applies the same nav on finish/abandon.
      if (firstTakePromptEnabled && result.savedMovies.length > 0) {
        setFirstTake({ movies: result.savedMovies, firstId: result.firstMovieTmdbId });
      } else {
        navigateAfterSave(result.savedMovies, result.firstMovieTmdbId);
      }
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), { context: 'scan-v2-save' });
    } finally {
      setIsSaving(false);
    }
  }, [user, items, queryClient, triggerAchievementCheck, firstTakePromptEnabled, navigateAfterSave]);

  // Finish (last movie posted) or abandon (X) — both apply the post-save nav.
  const handleFirstTakeFinish = useCallback(() => {
    if (!firstTake) return;
    navigateAfterSave(firstTake.movies, firstTake.firstId);
    setFirstTake(null);
  }, [firstTake, navigateAfterSave]);

  // ── render ────────────────────────────────────────────────────────────────

  // Not signed in — parity with v1 scanner.
  if (!user && !isAuthLoading) {
    return (
      <GuestSignInPrompt
        icon="ticket-outline"
        title="Scan Tickets"
        message="Sign in to scan movie tickets and log your cinema experiences"
      />
    );
  }

  // Neutral dark while auth / permission / scan-status resolve.
  if (isAuthLoading || permission === null || scansRemaining === null) {
    return <View style={{ flex: 1, backgroundColor: ScanV2Colors.bg }} />;
  }

  const cameraGranted = permission.granted;

  return (
    <View style={{ flex: 1, backgroundColor: ScanV2Colors.bg }}>
      {stage === 'camera' && cameraGranted && (
        <ScreenCamera
          captures={vms}
          scansLeft={scansRemaining}
          scanning={isScanning}
          onShutter={handleShutter}
          onEarnScan={handleEarnScan}
          onUpload={handleUpload}
          onContinue={handleContinue}
          onClose={handleClose}
          onEdit={setEditingId}
        />
      )}

      {((stage === 'camera' && !cameraGranted) || stage === 'permission') && (
        <ScreenPermission onOpenSettings={openSettings} onUpload={handleUpload} onBack={handleClose} />
      )}

      {stage === 'unable' && (
        <ScreenUnable
          scansLeft={scansRemaining}
          onRetry={() => setStage('camera')}
          onManual={() => router.push('/search')}
          onBack={() => setStage('camera')}
        />
      )}

      {stage === 'review' && (
        <>
          <ScreenReview
            tickets={vms}
            scansLeft={scansRemaining}
            duplicatesRemoved={duplicatesRemoved}
            showDupNotice={showDupNotice}
            isSaving={isSaving}
            onDismissDup={() => setShowDupNotice(false)}
            onSearch={() => setShowResolve(true)}
            onRemove={handleRemove}
            onEdit={setEditingId}
            onResolve={() => setShowResolve(true)}
            onSave={handleSave}
            onBack={() => setStage('camera')}
          />
          <ResolveDialog
            visible={showResolve}
            failed={failedVms}
            readyCount={readyCount}
            onResolveTicket={handleResolveTicket}
            onRemoveTicket={handleRemove}
            onSaveReady={handleSave}
            onClose={() => setShowResolve(false)}
          />
        </>
      )}

      {editingItem && editingVM && (
        <EditSheet
          vm={editingVM}
          ticket={editingItem.ticket}
          onClose={() => setEditingId(null)}
          onSave={handleSaveEdit}
        />
      )}

      {firstTake && user && (
        <FirstTakeSheet
          userId={user.id}
          movies={firstTake.movies}
          defaultVisibility={preferences?.reviewVisibility ?? 'public'}
          onClose={handleFirstTakeFinish}
          onDone={handleFirstTakeFinish}
        />
      )}
    </View>
  );
}
