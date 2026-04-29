import { ExpoConfig } from 'expo/config';

const appVersion = process.env.EXPO_APP_VERSION ?? '0.1.0';
const iosBuildNumber = process.env.EXPO_IOS_BUILD_NUMBER ?? '1';
const androidVersionCode = Number.parseInt(process.env.EXPO_ANDROID_VERSION_CODE ?? '1', 10);
const iosBundleIdentifier = process.env.EXPO_IOS_BUNDLE_IDENTIFIER ?? 'app.palmi.ios';
const androidPackage = process.env.EXPO_ANDROID_PACKAGE ?? 'app.palmi.android';
const easProjectId = process.env.EXPO_EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: 'palmi',
  slug: 'palmi',
  version: appVersion,
  orientation: 'portrait',
  scheme: 'palmi',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  description:
    'A quiet place for your people. Small circles, one question a day, no algorithm, no noise.',
  icon: './assets/icon.png',
  runtimeVersion: {
    policy: 'appVersion',
  },
  splash: {
    backgroundColor: '#FAF9F6',
    image: './assets/splash.png',
    resizeMode: 'contain',
  },
  ios: {
    bundleIdentifier: iosBundleIdentifier,
    buildNumber: iosBuildNumber,
    supportsTablet: false,
    associatedDomains: [],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryUsageDescription:
        'palmi needs access to your photos so you can share them with your circle.',
    },
  },
  android: {
    package: androidPackage,
    versionCode: Number.isFinite(androidVersionCode) ? androidVersionCode : 1,
    permissions: ['POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FAF9F6',
    },
  },
  plugins: [
    'expo-router',
    'expo-font',
    [
      'expo-image-picker',
      {
        photosPermission:
          'palmi needs access to your photos so you can share them with your circle.',
      },
    ],
    'expo-notifications',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    eas: {
      projectId: easProjectId,
    },
  },
};

export default config;
