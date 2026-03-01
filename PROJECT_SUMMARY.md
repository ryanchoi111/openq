# Project Summary

## Overview

OpenQ — React Native app (Expo 54) for managing real estate open house queues digitally. Tenants scan QR codes to join waitlists; agents manage tours in real-time.

## What's Implemented

### Auth (3 systems)
- **Guest mode**: name/phone/email → AsyncStorage, no signup friction
- **Supabase auth**: email/password with auto-session refresh
- **Clerk OAuth**: Google + Microsoft, role assignment post-login
- Guest → authenticated conversion flow

### Tenant (4 screens)
- QR scan → join active event queue
- Real-time position tracking via Supabase Realtime
- Express interest after tour
- Visit history (guest + auth)

### Agent (12 screens)
- Property CRUD with search/filter
- Event creation with date/time pickers
- QR code generation (`openhouse://join/{eventId}`)
- Live queue dashboard: call next, skip, no-show, complete
- Interest tracking
- Application distribution via Edge Function + email templates
- Profile picture + housing application uploads (Supabase Storage)
- Event history with completed tour details

### Backend
- 5 PostgreSQL tables with Row Level Security
- 2 storage buckets (profile-pictures, housing-applications)
- 4 database functions (position reorder, gap repair, timestamps)
- 9 performance indexes
- Supabase Realtime for live queue updates

### Services (6)
- propertyService — CRUD, search, available-for-event filter
- eventService — CRUD, auto status transitions, realtime
- waitlistService — queue join/reorder/status, realtime
- profileService — Supabase Storage uploads
- applicationService — send apps via Edge Function
- emailTemplateService — template CRUD + placeholder replacement

## File Count

| Category | Files |
|----------|-------|
| Screens | 20 |
| Services | 6 |
| Config | 2 (supabase, clerk) |
| Context | 1 (AuthContext — 747 lines) |
| Navigation | 2 (AppNavigator, types) |
| Types | 1 |
| Utils | 1 (clerkTokenCache) |

## Key Dependencies

```
@clerk/clerk-expo ^2.19     expo-camera ~17.0
@supabase/supabase-js ^2.79 react-native-qrcode-svg ^6.3
@react-navigation/* ^7.x    expo-image-picker
expo ^54.0                  expo-document-picker
react-native 0.81           expo-secure-store
```

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Supabase | Built-in auth, realtime, RLS, storage; free tier sufficient for MVP |
| Clerk OAuth | Better UX for Google/Microsoft SSO than raw Supabase OAuth |
| Guest mode | Reduces tenant friction; upgrade to account optional |
| Service layer | Separates DB logic from UI; type-safe, testable, reusable |
| AsyncStorage templates | Email templates are agent-local, no need for DB round-trips |
| RPC for reorder | Atomic position swaps prevent race conditions |

## Security

- RLS on all 5 tables
- Clerk tokens in expo-secure-store (not AsyncStorage)
- Input validation on all forms
- No sensitive data in logs
- `.env` gitignored
- Parameterized queries only

## Not Yet Implemented

- **Push notifications**: OneSignal configured in .env, hooks ready in EventDashboard
- **Property images**: Schema supports images[], needs UI
- **Analytics dashboard**: Data collected, needs visualization
- **Offline mode**: No queue for offline actions

## Known Considerations

- Guest data in AsyncStorage — cleared on new guest sign-in
- Profile creation retries 10x (handles Supabase FK timing)
- Supabase free tier: 500MB DB, 2GB bandwidth/mo, 200 concurrent realtime connections
- Event auto-transition depends on agent refresh (no server-side cron)

## Build & Deploy

- **EAS Build**: `eas build --platform android --profile production` (AAB)
- **Package**: `com.openqapp.openq` (Android + iOS)
- **Version**: 1.0.0 with auto-increment
- **Submit**: `eas submit --platform android` (service account key required)
