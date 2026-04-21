import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'palmi',
  slug: 'palmi',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'palmi',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    backgroundColor: '#FAF9F6',
    image: './assets/splash.png',
    resizeMode: 'contain',
  },
  ios: {
    bundleIdentifier: 'app.palmi.ios',
    supportsTablet: false,
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        'palmi needs access to your photos so you can share them with your circle.',
      NSCameraUsageDescription:
        'palmi uses the camera so you can post photos to your circle.',
    },
  },
  android: {
    package: 'app.palmi.android',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FAF9F6',
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-image-picker',
      {
        photosPermission:
          'palmi needs access to your photos so you can share them with your circle.',
        cameraPermission:
          'palmi uses the camera so you can post photos to your circle.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default config;
