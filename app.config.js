export default {
  expo: {
    owner: "tormaj",
    name: "PocketStubs",
    slug: "pocketstubs",
    version: "1.1.1",
    orientation: "portrait",
    updates: {
      url: "https://u.expo.dev/d71c1a95-3697-4a03-b485-813c803573f9",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
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
      }
    },
    android: {
      package: "com.pocketstubs.app",
      adaptiveIcon: {
        backgroundColor: "#000000",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        monochromeImage: "./assets/images/android-icon-foreground.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
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
            backgroundColor: "#000000",
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
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos to set a profile picture.",
          cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to take a profile picture.",
        },
      ],
      "@react-native-community/datetimepicker",
      [
        "react-native-google-mobile-ads",
        {
          // TODO: Replace with production Android AdMob app ID from console.admob.com
          androidAppId: "ca-app-pub-3940256099942544~3347511713",
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
