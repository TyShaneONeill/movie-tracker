export default {
  expo: {
    owner: "tormaj",
    name: "PocketStubs",
    slug: "pocketstubs",
    version: "1.4.1",
    orientation: "portrait",
    updates: {
      url: "https://u.expo.dev/d71c1a95-3697-4a03-b485-813c803573f9",
    },
    runtimeVersion: "1.4.0",
    icon: "./assets/images/icon.png",
    scheme: "pocketstubs",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      icon: {
        light: "./assets/images/icon-light.png",
        dark: "./assets/images/icon-dark.png",
        tinted: "./assets/images/icon-dark.png",
      },
      buildNumber: "30",
      supportsTablet: false,
      bundleIdentifier: "com.pocketstubs.app",
      usesAppleSignIn: true,
      associatedDomains: ["applinks:pocketstubs.com"],
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSUserTrackingUsageDescription: "This allows PocketStubs to show you relevant movie recommendations and ads.",
        CFBundleURLTypes: [
          {
            CFBundleURLName: "com.pocketstubs.app",
            CFBundleURLSchemes: ["pocketstubs"]
          }
        ]
      },
      entitlements: {
        "com.apple.security.application-groups": ["group.com.pocketstubs.app"],
        "keychain-access-groups": ["$(AppIdentifierPrefix)com.pocketstubs.app"]
      },
      deploymentTarget: "16.0",
    },
    android: {
      package: "com.pocketstubs.app",
      versionCode: 54,
      googleServicesFile: "./google-services.json",
      adaptiveIcon: {
        backgroundColor: "#000000",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        monochromeImage: "./assets/images/android-icon-foreground.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      // ACTIVITY_RECOGNITION is auto-merged into the manifest by expo-sensors
      // (it bundles a Pedometer module we don't use). Strip it here so Play
      // Console doesn't trigger the Health Apps declaration on submit.
      blockedPermissions: ["android.permission.ACTIVITY_RECOGNITION"],
      // Route pocketstubs:// URLs to the app on Android (e.g.,
      // pocketstubs://email-confirmed, pocketstubs://reset-password). iOS
      // handles this via CFBundleURLTypes above; Android needs an explicit
      // VIEW intent filter for the custom scheme.
      //
      // The second filter enables Android App Links for https://pocketstubs.com.
      // `autoVerify: true` triggers Android's install-time check against
      // /.well-known/assetlinks.json on the host. iOS handles the https case
      // via `associatedDomains` above.
      intentFilters: [
        {
          action: "VIEW",
          data: [{ scheme: "pocketstubs" }],
          category: ["BROWSABLE", "DEFAULT"],
        },
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "pocketstubs.com",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      ["expo-build-properties", { "ios": { "deploymentTarget": "16.0" } }],
      // Widget extension — injects the PocketStubsWidget Apple target on every
      // `expo prebuild`. Source-of-truth lives in expo-plugins/widget-extension/src/.
      // Runs after expo-build-properties so the iOS deployment target is already
      // applied when the plugin synthesizes the widget target.
      ["@bacons/apple-targets", { root: "./expo-plugins/widget-extension/src" }],
      ["@sentry/react-native/expo", { organization: "pocketstubs-5w", project: "react-native-pocketstubs" }],
      "expo-router",
      "expo-apple-authentication",
      ["@react-native-google-signin/google-signin", {
        // iosUrlScheme must be the reversed form of EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID.
        // Keeping this in sync with the env var prevents the GIDSignIn NSException crash
        // ("missing support for URL scheme") in release builds.
        iosUrlScheme: "com.googleusercontent.apps.886034953782-3jlpq4fm2qas6atfes6ekir6pn134h71",
      }],
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#FFFFFF",
          dark: {
            image: "./assets/images/splash-icon-dark.png",
            // Match the splash icon's baked background (#09090b) AND the app's
            // dark theme background (Colors.dark.background, Zinc 950). Pure
            // #000000 here left a visible seam: the icon's #09090b square sat on
            // a black fill, and the splash flashed against the app on mount.
            backgroundColor: "#09090b",
          },
        },
      ],
      "expo-tracking-transparency",
      "expo-secure-store",
      "expo-localization",
      "expo-notifications",
      [
        "expo-image-picker",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos to upload ticket images and set your profile picture.",
          cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to capture ticket photos and take your profile picture.",
        },
      ],
      "@react-native-community/datetimepicker",
      [
        "react-native-google-mobile-ads",
        {
          androidAppId: "ca-app-pub-5311715630678079~2922188131",
          iosAppId: "ca-app-pub-5311715630678079~5445543222",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      eas: {
        projectId: "d71c1a95-3697-4a03-b485-813c803573f9",
      },
    },
  },
};
