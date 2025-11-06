# OpenHouse App - Complete Setup Guide

Step-by-step instructions to get the app running.

## Prerequisites

- Node.js 18+ installed
- iOS Simulator (Mac) or Android Studio (any OS)
- Expo Go app on physical device (optional)
- Supabase account (free tier works)

## Part 1: Local Development Setup

### Step 1: Install Dependencies

```bash
cd /path/to/openq
npm install
```

Expected output: ~842 packages installed

### Step 2: Create Environment File

```bash
cp .env.example .env
```

Don't fill in values yet - we'll get them from Supabase next.

## Part 2: Supabase Backend Setup

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign in/create account
3. Click "New Project"
4. Fill in:
   - Name: `openhouse`
   - Database Password: (save this somewhere safe)
   - Region: Choose closest to you
5. Wait ~2 min for project creation

### Step 2: Get API Credentials

1. In Supabase dashboard, go to Settings → API
2. Copy two values:
   - **Project URL** (looks like `https://abc123.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

3. Update `.env`:
```bash
EXPO_PUBLIC_SUPABASE_URL=https://abc123.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-key-here
```

### Step 3: Create Database Schema

1. In Supabase dashboard, go to SQL Editor
2. Click "New Query"
3. Open `supabase-schema.sql` from project root
4. Copy entire contents
5. Paste into Supabase SQL Editor
6. Click "Run" (bottom right)
7. Should see "Success. No rows returned"

Verify tables created:
- Go to Table Editor
- Should see: users, properties, open_house_events, waitlist_entries, applications

### Step 4: Enable Realtime

1. Go to Database → Replication
2. Enable replication for:
   - `waitlist_entries`
   - `open_house_events`
3. Click "Save"

## Part 3: Run the App

### Option A: iOS Simulator (Mac only)

```bash
npm run ios
```

First run takes ~1 min to build. Simulator will open automatically.

### Option B: Android Emulator

```bash
npm run android
```

Make sure Android emulator is running first via Android Studio.

### Option C: Physical Device (Expo Go)

```bash
npx expo start
```

Scan QR code with:
- iOS: Camera app
- Android: Expo Go app

## Part 4: Test the App

### Create Test Agent Account

1. Launch app
2. Tap "Create Account"
3. Select "Agent" role
4. Enter:
   - Name: Test Agent
   - Email: agent@test.com
   - Password: test123
5. Tap "Sign Up"

### Create Test Property

1. Should see Agent Dashboard
2. Tap "My Properties"
3. Tap "+ Add Property"
4. Fill in:
   - Address: 123 Main St
   - City: San Francisco
   - State: CA
   - ZIP: 94102
   - Bedrooms: 2
   - Bathrooms: 1
   - Rent: 3000
5. Tap "Create Property"

### Create Open House Event

1. Go back to Dashboard
2. Tap "Create Open House"
3. Select the property you just created
4. Tap "Create & Start"
5. Should see Event Dashboard

### Display QR Code

1. In Event Dashboard, tap "Show QR Code"
2. QR code displays
3. Keep this screen open

### Test Guest Flow (Second Device/Simulator)

1. Open app on second device/simulator
2. Tap "Join as Guest"
3. Enter:
   - Name: Test Tenant
   - Phone: 555-123-4567
4. Tap "Continue"
5. Tap "Scan QR Code"
6. Allow camera permission
7. Scan QR code from agent's screen
8. Should see waitlist position #1

### Test Queue Management

Back on agent device:
1. In Event Dashboard, see "Test Tenant" in queue
2. Tap "Call Next"
3. Entry status changes to "touring"

On tenant device:
- Position should update to "It's your turn!"

On agent device:
1. Tap "Complete" on the entry
2. Entry marked as completed

On tenant device:
- Should see "Express Interest" button

## Part 5: OneSignal Setup (Optional)

### Step 1: Create OneSignal Account

1. Go to [onesignal.com](https://onesignal.com)
2. Sign up (free)
3. Click "New App/Website"
4. Name: OpenHouse
5. Select "Google Android (FCM)" and/or "Apple iOS (APNs)"

### Step 2: Configure OneSignal

For iOS:
1. Need Apple Developer account ($99/year)
2. Generate APNs certificate
3. Upload to OneSignal

For Android:
1. Create Firebase project
2. Get Server Key from Firebase
3. Add to OneSignal

### Step 3: Add to App

1. Get OneSignal App ID from Settings → Keys & IDs
2. Update `.env`:
```bash
EXPO_PUBLIC_ONESIGNAL_APP_ID=your-app-id-here
```

3. Update `app.json`:
```json
{
  "expo": {
    "plugins": [
      [
        "onesignal-expo-plugin",
        {
          "mode": "development"
        }
      ]
    ]
  }
}
```

4. Rebuild app:
```bash
npx expo prebuild
npm run ios  # or npm run android
```

## Troubleshooting

### "Supabase credentials not found"
- Check `.env` file exists in project root
- Verify values don't have quotes or extra spaces
- Restart Metro bundler: `npx expo start -c`

### Camera not working
- iOS: Settings → Privacy → Camera → OpenHouse → Enable
- Android: Settings → Apps → OpenHouse → Permissions → Camera → Allow

### "Cannot connect to database"
- Verify Supabase project is not paused (free tier pauses after 1 week inactivity)
- Check internet connection
- Verify database schema ran successfully

### TypeScript errors in editor
- Run `npm install` to ensure all deps installed
- Errors in `AppNavigator.tsx` are cosmetic, won't affect runtime
- If persistent, restart TS server in VS Code

### Metro bundler errors
```bash
# Clear cache and restart
npx expo start -c

# Reset everything
rm -rf node_modules
npm install
npx expo start -c
```

### App crashes on launch
- Check Metro bundler logs for errors
- Verify `.env` file is present
- Try on different simulator/device

## Next Steps

1. Read `README.md` for architecture details
2. Explore codebase in `src/`
3. Customize UI in screen files
4. Add features (see README "Next Steps")
5. Deploy to App Store/Play Store (requires Expo EAS)

## Production Deployment

### Build for iOS

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Configure
eas build:configure

# Build
eas build --platform ios
```

### Build for Android

```bash
eas build --platform android
```

### Submit to Stores

```bash
# iOS App Store
eas submit --platform ios

# Google Play
eas submit --platform android
```

See [Expo docs](https://docs.expo.dev/build/introduction/) for detailed deployment guide.

## Support

For issues:
1. Check this guide's troubleshooting section
2. Review error messages in Metro bundler
3. Check Supabase logs in Dashboard → Logs
4. Verify RLS policies in Database → Policies

## Resources

- [Expo Docs](https://docs.expo.dev)
- [Supabase Docs](https://supabase.com/docs)
- [React Navigation Docs](https://reactnavigation.org)
- [OneSignal Docs](https://documentation.onesignal.com)
