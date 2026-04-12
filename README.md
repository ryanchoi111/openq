# OpenQ — Open House Queue Management for Real Estate

OpenQ is a mobile-first open house management platform built for real estate agents and property managers. It digitizes the open house experience: tenants scan QR codes to join virtual waitlists, agents manage live tour queues in real-time, and Zillow lead capture runs automatically via Gmail integration.

Built with React Native (Expo), Supabase, and TypeScript.

## Why OpenQ

- **No more paper sign-in sheets** — tenants join digitally via QR code scan
- **Real-time queue management** — agents see live waitlists, call next, skip no-shows
- **Automated lead capture** — Zillow rental tour request emails parsed and stored automatically
- **Application distribution** — send housing applications to interested tenants in one tap
- **Works for guests** — no account required for tenants to join a tour queue

## Use Cases

- **Rental property open houses** — manage walk-in tours for apartments, condos, townhomes
- **Real estate agent lead management** — capture and organize Zillow tour requests
- **Property management showings** — streamline tenant screening with digital waitlists
- **Multi-unit apartment tours** — handle high-volume open house events with live queue tracking
- **Broker open houses** — agents display QR codes, attendees check in instantly

## Features

### For Real Estate Agents & Property Managers
- Property listings with address, beds/baths, rent, images
- Open house event scheduling with automatic status transitions
- QR code generation for tenant check-in
- Live queue dashboard — call next, skip, mark no-show, complete tour
- Interest tracking per tenant
- Bulk housing application email distribution via customizable templates
- Profile and housing application PDF uploads
- Event history with completed tour analytics

### Zillow Lead Capture (Gmail Integration)
- Connect Gmail via Google OAuth
- Automatic monitoring for Zillow Rentals tour request emails
- Parses client name, email, phone, and property address from Zillow emails
- Zillow tour requests displayed in agent profile
- Real-time push notifications via Google Cloud Pub/Sub

### For Tenants & Prospective Renters
- Scan QR code at open house to join waitlist instantly
- Guest quick-join — name, phone, email only (no signup needed)
- Real-time position tracking in queue
- "Express Interest" button after touring
- Visit history across all attended open houses
- Full account creation with Google OAuth

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile Framework | React Native 0.81, Expo 54, TypeScript 5.9 |
| Auth | Supabase Auth (Google OAuth, email/password, guest) |
| Backend | Supabase (PostgreSQL, Realtime, Storage, Edge Functions) |
| Email | Resend API (application distribution) |
| Gmail Integration | Google Gmail API, Cloud Pub/Sub |
| Navigation | React Navigation 7 (native-stack, bottom-tabs) |
| QR | expo-camera, react-native-qrcode-svg |
| Hosting | Supabase Edge Functions (Deno) |

## Architecture

```
┌─────────────────────────────────────────────┐
│              React Native App               │
│  (Expo / iOS / Android / Web)               │
├─────────────────────────────────────────────┤
│  AuthContext │ Services │ Screens           │
│  (Supabase)  │ (API)    │ (Agent/Tenant)   │
└──────┬───────┴────┬─────┴──────────────────┘
       │            │
       ▼            ▼
┌─────────────┐  ┌──────────────────────────┐
│  Supabase   │  │  Supabase Edge Functions  │
│  PostgreSQL │  │  - send-application-email │
│  Realtime   │  │  - gmail-watch            │
│  Storage    │  │  - gmail-webhook          │
│  Auth       │  └────────┬─────────────────┘
└─────────────┘           │
                          ▼
              ┌───────────────────────┐
              │  Google Cloud Pub/Sub │
              │  Gmail API            │
              │  Resend Email API     │
              └───────────────────────┘
```

## Database

7 tables with Row Level Security:

| Table | Purpose |
|-------|---------|
| `users` | Auth profiles (name, role, profile picture, housing app) |
| `properties` | Agent property listings (address, beds, baths, rent, images) |
| `open_house_events` | Scheduled events (start/end, status, QR code) |
| `waitlist_entries` | Queue positions with status tracking (guest + auth users) |
| `applications` | Housing application distribution records |
| `agent_gmail_connections` | Gmail OAuth tokens, watch state, history tracking |
| `tour_requests` | Parsed tour request data from Zillow, StreetEasy, etc. (client info, property address) |

2 storage buckets: `profile-pictures`, `housing-applications`

## User Flows

### Tenant
```
Arrive at Open House → Scan QR Code → Join Queue → Real-time Position Updates →
"Your Turn" Notification → Tour Property → Express Interest → Receive Application
```

### Agent
```
Create Property Listing → Schedule Open House → Display QR Code →
Manage Live Queue → Call Next Tenant → Complete Tour →
Send Housing Applications → Review Zillow Leads
```

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
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
```

### 3. Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run `supabase-schema.sql` in SQL Editor
3. Copy URL + anon key from Settings > API
4. Deploy edge functions:
```bash
supabase functions deploy send-application-email
supabase functions deploy gmail-watch
supabase functions deploy gmail-webhook
```
5. Set edge function secrets:
```bash
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_PROJECT_ID=... RESEND_API_KEY=...
```

### 4. Run

```bash
npx expo start        # Dev server
npm run ios           # iOS
npm run android       # Android
npm run web           # Web
```

## Build & Deploy

```bash
eas build --platform android --profile production
eas build --platform ios --profile production
eas submit --platform android
```

## Troubleshooting

- **Camera denied**: Enable in device Settings > OpenQ > Camera
- **Supabase errors**: Verify `.env` credentials, confirm schema deployed
- **Metro cache**: `npx expo start -c`
- **Gmail not connecting**: Ensure Google Cloud Pub/Sub topic exists and OAuth consent screen includes `gmail.readonly` scope

## Keywords

`real estate` `open house` `property management` `rental management` `tour scheduling` `tenant screening` `waitlist management` `queue management` `QR code check-in` `Zillow integration` `Zillow lead capture` `rental lead management` `property showing` `apartment tours` `real estate agent tools` `proptech` `property technology` `real estate CRM` `showing management` `open house sign-in` `digital sign-in sheet` `real estate mobile app` `rental property tours` `housing application` `tenant management` `real estate automation` `MLS integration` `broker tools` `leasing agent` `multifamily` `property listing`

## License

MIT
