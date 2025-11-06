# OpenHouse - Open House Streamlining App

Digital waitlist/queueing system for real estate open houses. Eliminates physical lines, enables virtual queue mgmt via QR codes.

## Features

- **Digital Waitlist**: Scan QR → join queue → realtime position updates
- **Guest Mode**: Quick join (name/phone only), upgrade to account later
- **Agent Dashboard**: Manage queue, call next person, track interest
- **Interest Tracking**: "Express Interest" button → agent sends applications
- **Property Management**: Agents create properties, schedule open houses
- **Realtime Updates**: Supabase realtime for live queue changes

## Tech Stack

- React Native (Expo)
- TypeScript
- Supabase (auth, database, realtime)
- React Navigation
- expo-barcode-scanner
- react-native-qrcode-svg
- OneSignal (push notifications - to be configured)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Supabase Setup

1. Create project at [supabase.com](https://supabase.com)
2. Run SQL from `supabase-schema.sql` in Supabase SQL Editor
3. Get credentials: Settings > API
4. Create `.env`:

```bash
cp .env.example .env
```

Edit `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_ONESIGNAL_APP_ID=your-onesignal-id
```

### 3. OneSignal Setup (Optional)

1. Create app at [onesignal.com](https://onesignal.com)
2. Add app ID to `.env`
3. Configure in `app.json`:

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

### 4. Run App

```bash
# iOS
npm run ios

# Android
npm run android

# Web
npm run web
```

## User Flows

### Tenant Flow
1. Welcome → "Join as Guest"
2. Enter name/phone
3. Scan QR code at open house
4. View queue position (realtime updates)
5. Get notified when it's your turn
6. Express interest after tour
7. (Optional) Create account to track applications

### Agent Flow
1. Sign Up as Agent
2. Create Property
3. Create Open House Event
4. Display QR Code
5. Manage Queue Dashboard
   - View waitlist
   - Call next person
   - Mark tours complete
   - See who expressed interest
6. Send applications to interested tenants

## Architecture

```
src/
├── config/          # Supabase client
├── contexts/        # AuthContext (guest + Supabase)
├── navigation/      # React Navigation setup
├── screens/
│   ├── auth/        # Welcome, SignIn, SignUp, GuestJoin
│   ├── tenant/      # TenantHome, ScanQR, WaitlistView
│   └── agent/       # AgentHome, Properties, Events, QR
├── services/        # API layer (waitlist, event, property)
├── types/           # TypeScript definitions
└── utils/           # Helper functions
```

## Database Schema

**users** - Extends Supabase auth
- id, email, phone, name, role (agent|tenant), onesignal_player_id

**properties** - Agent listings
- id, agent_id, address, city, state, zip, bedrooms, bathrooms, rent, description, images

**open_house_events** - Scheduled open houses
- id, property_id, agent_id, start_time, end_time, status, qr_code

**waitlist_entries** - Queue positions (supports guests)
- id, event_id, user_id (nullable), guest_name, guest_phone, position, status, expressed_interest, application_sent

**applications** - Sent applications
- id, event_id, waitlist_entry_id, property_id, recipient_email, recipient_phone, status

## Security

- Row Level Security (RLS) enabled on all tables
- Guests can insert waitlist entries, limited read access
- Agents can only manage their own properties/events
- Input validation on all forms
- Parameterized queries via Supabase client

## Push Notifications

OneSignal integration hooks ready in:
- `EventDashboardScreen.tsx:49` - Send notification when calling next person
- `WaitlistViewScreen.tsx` - Receive tour notifications

To implement:
1. Install OneSignal SDK
2. Add player ID to user record on auth
3. Trigger notifications from agent actions

## Development Notes

- Type errors in `AppNavigator.tsx` are cosmetic (React Navigation typing quirk)
- Guest users stored in AsyncStorage until account creation
- QR code format: `openhouse://join/{eventId}`
- Realtime subscriptions auto-cleanup on unmount

## Next Steps

1. Implement OneSignal push notifications
2. Add image upload for properties
3. Build analytics dashboard for agents
4. Add email/SMS for application delivery
5. Implement property search for tenants
6. Add calendar scheduling for events

## Troubleshooting

**Camera permission denied**: Enable in iOS Settings > OpenHouse > Camera

**Supabase errors**: Check `.env` credentials, verify schema is deployed

**Navigation errors**: Clear Metro cache: `expo start -c`

**TypeScript errors**: Run `npm install` to ensure all deps installed

## License

MIT
