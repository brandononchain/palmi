import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// True when running inside the pre-built Expo Go app. Remote push was removed
// from Expo Go in SDK 53; calling the notifications API in that environment
// just produces warning spam. We silently skip until the user runs a dev build.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// Calm defaults: show silently in foreground too, no sound.
// Skipped in Expo Go to avoid the SDK-53 warning on every launch.
if (!IS_EXPO_GO) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export interface RegisterResult {
  token: string | null;
  // 'granted' | 'denied' | 'undetermined' | 'unsupported'
  status: string;
}

export async function getPushPermissionStatusAsync(): Promise<string> {
  if (IS_EXPO_GO) return 'expo_go';
  if (!Device.isDevice) return 'unsupported';
  const existing = await Notifications.getPermissionsAsync();
  return existing.status;
}

// Requests OS push permission, fetches the Expo push token, and upserts it
// into public.push_tokens. On denial or simulator, returns without persisting.
// Safe to call multiple times — idempotent by (user_id, token).
export async function registerForPushAsync(userId: string): Promise<RegisterResult> {
  if (IS_EXPO_GO) return { token: null, status: 'expo_go' };
  if (!Device.isDevice) return { token: null, status: 'unsupported' };

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return { token: null, status };

  // Android needs a channel for alerts to show.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'palmi',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: undefined,
      vibrationPattern: [0, 150, 100, 150],
      lightColor: '#D65745',
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? (Constants.easConfig as any)?.projectId;
  const tokenRes = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const token = tokenRes.data;

  await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      enabled: true,
    },
    { onConflict: 'user_id,token' }
  );

  return { token, status: 'granted' };
}

// Fire a test push at the currently-registered device. Used by the debug
// button in settings. Hits the Expo Push API directly — no auth needed.
export async function sendTestPush(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('enabled', true)
    .limit(1)
    .maybeSingle();
  const token = (data as any)?.token as string | undefined;
  if (!token) return false;

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify({
      to: token,
      title: 'palmi',
      body: 'test notification — calm, quiet, ok.',
      sound: null,
      data: { type: 'test' },
    }),
  });
  return res.ok;
}
