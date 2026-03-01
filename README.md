# OpenQ

Digital waitlist system for real estate open houses. Tenants scan QR codes to join virtual queues; agents manage tours in real-time.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.81, Expo 54, TypeScript 5.9 |
| Auth | Clerk (Google/Microsoft OAuth), Supabase (email/password), AsyncStorage (guest) |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| Navigation | React Navigation 7 (native-stack, bottom-tabs) |
| QR | expo-camera, react-native-qrcode-svg |

## Features

### Tenant
- Guest quick-join (name/phone/email, no signup)
- QR scan → join queue → real-time position updates
- "Express Interest" after tour
- Visit history
- Guest → account conversion

### Agent
- Property CRUD
- Open house event creation with date/time pickers
- QR code generation & display
- Live queue dashboard (call next, skip, no-show, complete)
- Interest tracking & application distribution
- Customizable email templates
- Profile picture & housing application uploads
- Event history with completed tour details

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment

Create `.env`:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_ONESIGNAL_APP_ID=your-onesignal-id
```

### 3. Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run `supabase-schema.sql` in SQL Editor
3. Copy URL + anon key from Settings > API

### 4. Run

```bash
npx expo start        # Dev server
npm run ios           # iOS
npm run android       # Android
npm run web           # Web
```

## User Flows

### Tenant
```
Welcome → Guest Join → Scan QR → Join Queue → Real-time Position →
"Your Turn" → Tour → Express Interest → (Optional) Create Account
```

### Agent
```
Sign Up (agent) → Create Property → Create Event → Display QR →
Manage Queue → Call Next → Complete Tour → Send Applications
```

## Database

5 tables with Row Level Security:

| Table | Purpose |
|-------|---------|
| users | Extends Supabase auth (name, role, profile_picture, housing_app) |
| properties | Agent listings (address, beds, baths, rent) |
| open_house_events | Scheduled events (start/end time, status, qr_code) |
| waitlist_entries | Queue positions (supports guest + auth users) |
| applications | Sent housing applications |

2 storage buckets: `profile-pictures`, `housing-applications`

## Build & Deploy

```bash
eas build --platform android --profile production   # AAB for Play Store
eas build --platform ios --profile production        # IPA for App Store
eas submit --platform android                        # Submit to Play Store
```

## Troubleshooting

- **Camera denied**: Enable in device Settings > OpenQ > Camera
- **Supabase errors**: Verify `.env` credentials, confirm schema deployed
- **Metro cache**: `npx expo start -c`

## License

MIT
