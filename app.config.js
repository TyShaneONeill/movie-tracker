export default {
  expo: {
    name: "CineTrak",
    slug: "cinetrak",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "cinetrak",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.cinetrak.app",
      usesAppleSignIn: true,
      associatedDomains: ["applinks:cinetrak.app"],
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        CFBundleURLTypes: [
          {
            CFBundleURLName: "com.cinetrak.app",
            CFBundleURLSchemes: ["cinetrak"]
          },
          {
            CFBundleURLSchemes: [
              "com.googleusercontent.apps.886034953782-jn8kerjnbnu38hoc100vh08p7cb5arah"
            ]
          }
        ]
      }
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#000000",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "@sentry/react-native/expo",
      "expo-router",
      "expo-apple-authentication",
      "@react-native-google-signin/google-signin",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      "expo-secure-store",
      "expo-localization",
      [
        "expo-image-picker",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos to set a profile picture.",
          cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to take a profile picture.",
        },
      ],
      [
        "react-native-google-mobile-ads",
        {
          androidAppId: "ca-app-pub-3940256099942544~3347511713",
          iosAppId: "ca-app-pub-3940256099942544~1458002511",
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
        projectId: "ecccbab0-48e5-4c5c-b830-f14131408a69",
      },
    },
  },
};
