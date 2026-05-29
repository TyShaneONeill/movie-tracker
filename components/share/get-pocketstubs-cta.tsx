import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Fonts, FontSizes } from '@/constants/theme';

/**
 * Store / web-app destinations for the "Get PocketStubs" CTA.
 *
 * The App Store URL uses the canonical `id<APP_ID>` form (Apple app ID
 * 6760832346 — https://apps.apple.com/app/pocketstubs). The Play Store URL is
 * derived from the Android `package` in app.config.js (`com.pocketstubs.app`).
 * The web-app URL is the apex that serves these fallback pages (see
 * docs/PRD-social-share.md — this repo IS the web host).
 */
const APP_STORE_URL = 'https://apps.apple.com/app/id6760832346';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.pocketstubs.app';
const WEB_APP_URL = 'https://pocketstubs.com';

/**
 * Append share-attribution UTM params to a destination URL. Attribution is
 * UTM-only by design — no install-attribution SDK (see PRD-6 Sprint 3).
 */
function withUtm(baseUrl: string, utmContent: string): string {
  const sep = baseUrl.includes('?') ? '&' : '?';
  const params = [
    'utm_source=share',
    'utm_medium=web',
    `utm_content=${encodeURIComponent(utmContent)}`,
  ].join('&');
  return `${baseUrl}${sep}${params}`;
}

interface GetPocketStubsCTAProps {
  /**
   * Value for the `utm_content` param, identifying which share surface drove
   * the click (e.g. 'review', 'first-take', 'movie', 'tv'). Defaults to
   * 'review' since that is the first surface to ship a web fallback.
   */
  utmContent?: string;
}

interface CtaButton {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  url: string;
}

/**
 * "Get PocketStubs" call-to-action block rendered beneath the shared content
 * on web fallback pages. Surfaces App Store, Google Play, and web-app
 * destinations, each carrying share-attribution UTM params.
 *
 * Reused across every web fallback surface (review / first take / movie / tv);
 * callers vary only `utmContent`.
 */
export function GetPocketStubsCTA({ utmContent = 'review' }: GetPocketStubsCTAProps) {
  const buttons: CtaButton[] = [
    { key: 'ios', label: 'Download on the App Store', icon: 'logo-apple', url: APP_STORE_URL },
    { key: 'android', label: 'Get it on Google Play', icon: 'logo-google-playstore', url: PLAY_STORE_URL },
    { key: 'web', label: 'Use the web app', icon: 'globe-outline', url: WEB_APP_URL },
  ];

  const open = (url: string) => {
    Linking.openURL(withUtm(url, utmContent)).catch(() => {
      // Swallow — a failed store hand-off shouldn't surface an error to a
      // recipient who is just browsing a shared link.
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Get PocketStubs</Text>
      <Text style={styles.subheading}>
        Track what you watch, write reviews, and share your takes.
      </Text>
      <View style={styles.buttons}>
        {buttons.map((b) => (
          <Pressable
            key={b.key}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => open(b.url)}
            accessibilityRole="link"
            accessibilityLabel={b.label}
          >
            <Ionicons name={b.icon} size={20} color={Colors.dark.text} style={styles.buttonIcon} />
            <Text style={styles.buttonLabel}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 360,
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  heading: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: FontSizes.xl,
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  subheading: {
    fontFamily: Fonts.inter.regular,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  buttons: {
    width: '100%',
    gap: Spacing.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as unknown as undefined } : {}),
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonIcon: {
    marginRight: Spacing.sm,
  },
  buttonLabel: {
    fontFamily: Fonts.outfit.bold,
    fontSize: FontSizes.base,
    color: Colors.dark.text,
  },
});

export default GetPocketStubsCTA;
