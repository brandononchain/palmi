# Palmi Marketplace Release

This is the publish path for TestFlight, Google Play internal testing, and then public store release.

## Recommended Production Values

Use one stable identifier set across Apple, Google, and EAS unless you intentionally want separate app identities.

| Setting | Recommended value |
| --- | --- |
| Product name | `Palmi` |
| iOS bundle identifier | `app.palmi.ios` |
| Android package name | `app.palmi.android` |
| App Store Connect SKU | `palmi-ios` |
| Google Play application name | `Palmi` |
| Initial marketing version | `0.1.0` |
| Initial iOS build number | `1` |
| Initial Android version code | `1` |
| Privacy policy URL | `https://palmi.app/privacy` |
| Support URL | `https://palmi.app` |
| Support email | `hi@palmi.app` |
| Privacy contact email | `privacy@palmi.app` |

If you want the long-term public version to start at `1.0.0`, change `EXPO_APP_VERSION` before the first production submission and keep the build counters at `1`.

## 1. Release Checklist

### Build and identity

- Set a permanent iOS bundle identifier in [app/app.config.ts](app/app.config.ts).
- Set a permanent Android package name in [app/app.config.ts](app/app.config.ts).
- Set `EXPO_EAS_PROJECT_ID`, `EXPO_IOS_BUILD_NUMBER`, `EXPO_ANDROID_VERSION_CODE`, and `EXPO_APP_VERSION` in [app/.env.example](app/.env.example) or the real build environment.
- Confirm [app/eas.json](app/eas.json) matches the intended release flow: `preview` for internal beta, `production` for store submission.
- Keep [app/assets/icon.png](app/assets/icon.png), [app/assets/adaptive-icon.png](app/assets/adaptive-icon.png), and [app/assets/splash.png](app/assets/splash.png) in place for build reproducibility.

### Store accounts

- Create the app record in App Store Connect.
- Create the app record in Google Play Console.
- Set support URL and privacy policy URL to the live site.
- Upload screenshots, icon, subtitle/short description, and category metadata.
- Complete age rating/content questionnaire in both stores.
- Complete export-compliance answer for iOS. Current config declares `ITSAppUsesNonExemptEncryption=false` in [app/app.config.ts](app/app.config.ts).

### Backend and operations

- Ensure production Supabase env vars are set for both mobile and web surfaces.
- Confirm SMS auth works in production with Twilio.
- Confirm Stripe checkout and billing portal work from device builds.
- Add Expo push credentials before enabling notification testing in distributed builds.
- Run one real waitlist signup and confirm rows land in `public.email_opt_ins` and `public.waitlist`.

### Product and policy

- Keep the app invite-only for the first store submission if you want a beta without open acquisition.
- Make sure the live privacy policy matches the shipped behavior at [apps/web/app/(legal)/privacy/page.tsx](apps/web/app/(legal)/privacy/page.tsx).
- Make sure support mailboxes exist: `hi@palmi.app` and `privacy@palmi.app`.

### Repo privacy plan

- The repo can be made private after the app is published, but do it after verifying CI, deploy hooks, and any external integrations do not depend on public access.
- Before making the repo private, confirm no credentials were ever committed and rotate anything that touched local `.env` files or build credentials.
- Keep the production privacy policy and terms publicly reachable even if the code repo becomes private.

## 2. Exact EAS Commands

### Apple and Google account sequence

1. In Apple Developer, create the App ID `app.palmi.ios`.
2. In App Store Connect, create app `Palmi` with SKU `palmi-ios` and bundle ID `app.palmi.ios`.
3. In Google Play Console, create app `Palmi` with default language `English (United States)`.
4. Reserve the Android application ID `app.palmi.android` in the first release created from your EAS artifact.
5. In Expo, link this repo to one EAS project and copy its `projectId` into `EXPO_EAS_PROJECT_ID`.
6. Set the environment variables below before the first build.

### PowerShell setup

Run from the repository root:

```powershell
Set-Location .\app
$env:EXPO_EAS_PROJECT_ID = "your-eas-project-id"
$env:EXPO_IOS_BUNDLE_IDENTIFIER = "app.palmi.ios"
$env:EXPO_ANDROID_PACKAGE = "app.palmi.android"
$env:EXPO_IOS_BUILD_NUMBER = "1"
$env:EXPO_ANDROID_VERSION_CODE = "1"
$env:EXPO_APP_VERSION = "0.1.0"
```

Recommended persistent values for local and CI environments:

```env
EXPO_EAS_PROJECT_ID=replace-with-eas-project-id
EXPO_IOS_BUNDLE_IDENTIFIER=app.palmi.ios
EXPO_ANDROID_PACKAGE=app.palmi.android
EXPO_IOS_BUILD_NUMBER=1
EXPO_ANDROID_VERSION_CODE=1
EXPO_APP_VERSION=0.1.0
```

### First-time setup

```powershell
npx eas login
npx eas init
npx eas credentials
```

During `npx eas credentials`:

- Let EAS manage the iOS distribution certificate and provisioning profile.
- Let EAS generate the Android keystore if you do not already have one.
- Save the keystore backup outside the repo.

### Internal beta builds

```powershell
npx eas build --platform ios --profile preview
npx eas build --platform android --profile preview
```

Use these for TestFlight external/internal testers and Google Play internal testing.

### Store-ready production builds

```powershell
npx eas build --platform ios --profile production
npx eas build --platform android --profile production
```

### Submit latest production builds

```powershell
npx eas submit --platform ios --profile production --latest
npx eas submit --platform android --profile production --latest
```

### First publish command sequence

```powershell
Set-Location .\app
npx eas login
npx eas init
npx eas credentials
npx eas build --platform ios --profile preview
npx eas build --platform android --profile preview
npx eas build --platform ios --profile production
npx eas build --platform android --profile production
npx eas submit --platform ios --profile production --latest
npx eas submit --platform android --profile production --latest
```

### Version bump rule before each new store build

- Increment `EXPO_IOS_BUILD_NUMBER` every iOS build sent to App Store Connect.
- Increment `EXPO_ANDROID_VERSION_CODE` every Android build sent to Play Console.
- Increment `EXPO_APP_VERSION` when you want a user-visible version change.

## 3. Store Privacy And Data Safety Audit

This section is based on the current code paths in [app](app), the web waitlist flow in [apps/web/app/actions.ts](apps/web/app/actions.ts), and the privacy policy in [apps/web/app/(legal)/privacy/page.tsx](apps/web/app/(legal)/privacy/page.tsx).

### Data collected

| Data type                                 | Present in code | Linked to user                      | Purpose                                  |
| ----------------------------------------- | --------------- | ----------------------------------- | ---------------------------------------- |
| Phone number                              | Yes             | Yes                                 | Sign-in, verification, account integrity |
| User ID / account identity                | Yes             | Yes                                 | Authentication and account state         |
| Name / profile info                       | Yes             | Yes                                 | Profile display and circle identity      |
| Photos                                    | Yes             | Yes                                 | Profile photos and circle posts          |
| Videos                                    | Yes             | Yes                                 | Circle posts                             |
| User content                              | Yes             | Yes                                 | Core product functionality               |
| Approximate location you type manually    | Yes             | Yes                                 | Profile context                          |
| Push token                                | Yes             | Yes                                 | Notifications                            |
| Purchase identifiers / subscription state | Yes             | Yes                                 | Premium billing and access               |
| Email address on waitlist                 | Yes             | Usually not tied to app account yet | Waitlist and launch updates              |

### Data not collected from device APIs

- No precise GPS location.
- No contacts.
- No calendar.
- No microphone recording in the shipped config.
- No camera capture flow in current code.
- No advertising ID / third-party ad tracking SDK.

### Apple App Privacy likely answers

`Contact Info`

- `Phone Number`: collected, linked to the user, used for app functionality and account management.
- `Email Address`: collected on the waitlist web flow, not required for in-app account creation.

`User Content`

- `Photos or Videos`: collected, linked to the user, used for app functionality.
- `Other User Content`: posts, answers, replies, recaps, and profile text are collected, linked, and used for app functionality.

`Identifiers`

- User/account identifiers are collected and linked for authentication and product function.
- Device push token is collected and linked for notifications.

`Financial Info`

- Subscription and billing status are used, but card entry is handled by Stripe-hosted checkout rather than native in-app payment forms.

`Diagnostics`

- Do not claim crash-report collection unless you add a crash SDK. The current codebase does not show Sentry, Crashlytics, or equivalent.

`Tracking`

- Current codebase does not indicate cross-app tracking. Answer `No` unless you later add ad attribution or third-party tracking SDKs.

### Google Play Data Safety likely answers

`Collected`

- Personal info: phone number, optional profile fields, waitlist email.
- Photos and videos.
- App activity / user-generated content.
- App info and performance basics only if you add a diagnostics SDK. Right now this should stay conservative.
- Device or other identifiers tied to push delivery and authentication.
- Financial info should be limited to subscription/account state, with payments processed by Stripe-hosted flows.

`Shared`

- Twilio for SMS OTP.
- Supabase for auth, database, and storage.
- Expo for push delivery.
- Stripe for subscription checkout and billing portal.
- LLM providers for moderation, question generation, and recap drafting, with no direct phone/name/profile fields sent.

`Required or optional`

- Phone number is required for account access.
- Photos and videos are optional and user-initiated.
- Push notifications are optional and opt-in.
- Waitlist email is optional and outside the core in-app auth flow.

### Policy mismatches fixed in this pass

- Removed camera declarations from [app/app.config.ts](app/app.config.ts) because the current app code does not capture photos with the device camera.
- Updated [apps/web/app/(legal)/privacy/page.tsx](apps/web/app/(legal)/privacy/page.tsx) to remove unsupported `crash reports` language and add Stripe plus recap-generation coverage.

## 4. Recommended First Publish Sequence

1. Ship iOS and Android internal builds with the `preview` profile.
2. Test login, onboarding, posting, billing, push opt-in, and profile photo upload on physical devices.
3. Submit the same line to TestFlight and Google Play internal testing.
4. Keep access invite-only inside the product while store listings remain live.
5. Make the repo private only after store builds and deployment automation are confirmed stable.
