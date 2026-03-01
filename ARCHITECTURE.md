# Architecture

## Directory Structure

```
src/
├── config/
│   ├── clerk.ts                    # Clerk publishable key
│   └── supabase.ts                 # Supabase client init (AsyncStorage auth)
├── contexts/
│   └── AuthContext.tsx              # Global auth state (guest + Supabase + Clerk OAuth)
├── navigation/
│   ├── AppNavigator.tsx             # Root router, tab nav, auth guards
│   └── types.ts                     # Navigation param types
├── screens/
│   ├── auth/                        # 4 screens
│   │   ├── WelcomeScreen.tsx        # Entry point, role selection
│   │   ├── SignInScreen.tsx          # Clerk email/password
│   │   ├── SignUpScreen.tsx          # Clerk + OAuth (Google/Microsoft)
│   │   └── GuestJoinScreen.tsx      # Name/phone/email quick join
│   ├── tenant/                      # 4 screens
│   │   ├── TenantHomeScreen.tsx     # Dashboard, scan/history buttons
│   │   ├── ScanQRScreen.tsx         # Camera + QR parsing
│   │   ├── WaitlistViewScreen.tsx   # Real-time position tracking
│   │   └── TenantHistoryScreen.tsx  # Past events
│   └── agent/                       # 12 screens
│       ├── AgentHomeScreen.tsx      # Scheduled/active events list
│       ├── PropertiesScreen.tsx     # Property list
│       ├── CreatePropertyScreen.tsx # Property form
│       ├── EditPropertyScreen.tsx   # Edit/delete property
│       ├── CreateEventScreen.tsx    # Event form with date/time pickers
│       ├── EventDashboardScreen.tsx # Live queue management
│       ├── QRDisplayScreen.tsx      # QR code display
│       ├── EventHistoryScreen.tsx   # Completed/cancelled events
│       ├── CompletedToursScreen.tsx # Tour details for completed event
│       ├── CompletedEventWaitlistScreen.tsx
│       ├── SelectTenantsScreen.tsx  # Multi-select for application send
│       ├── EditEmailTemplateScreen.tsx # Email template editor
│       └── ProfileScreen.tsx       # Profile pic, housing app upload
├── services/                        # Data access layer
│   ├── propertyService.ts           # Property CRUD + search
│   ├── eventService.ts              # Event CRUD + status transitions + realtime
│   ├── waitlistService.ts           # Queue ops + reorder + realtime
│   ├── profileService.ts            # Profile pic + housing app uploads
│   ├── applicationService.ts        # Send apps via Edge Function
│   └── emailTemplateService.ts      # Template CRUD (AsyncStorage)
├── types/
│   └── index.ts                     # All shared TypeScript interfaces
└── utils/
    └── clerkTokenCache.ts           # Secure token storage (expo-secure-store)
```

## Navigation

```
RootStack
├── Auth (unauthenticated)
│   ├── Welcome
│   ├── SignIn
│   ├── SignUp
│   └── GuestJoin
└── Main (authenticated)
    ├── AgentStack (role=agent)
    │   ├── AgentTabs (bottom tabs)
    │   │   ├── Home
    │   │   ├── Properties
    │   │   ├── Create Event
    │   │   ├── Event History
    │   │   └── Profile
    │   └── Modal screens (pushed)
    │       ├── CreateProperty, EditProperty
    │       ├── EventDashboard, QRDisplay
    │       ├── CompletedTours, CompletedEventWaitlist
    │       ├── SelectTenants, EditEmailTemplate
    └── TenantStack (role=tenant/guest)
        ├── TenantHome
        ├── ScanQR
        ├── WaitlistView
        └── TenantHistory
```

## Auth Flow

```
App Launch
    ↓
AuthContext checks AsyncStorage (guest) + Supabase session
    ↓
No user → Welcome Screen
    ├── Guest Join → AsyncStorage, UUID id, role=guest
    ├── Sign In → Clerk email/password → Supabase session
    └── Sign Up → Clerk + OAuth → Supabase profile creation (retry 10x)
    ↓
User authenticated → role check → Agent or Tenant stack
```

Three auth systems unified in AuthContext:
1. **Guest**: AsyncStorage (`@openhouse:guest_user`), ID format `guest_{ts}_{rand}`
2. **Supabase**: Email/password, session auto-refresh
3. **Clerk OAuth**: Google/Microsoft, role stored in AsyncStorage pre-login

## Data Flow

### Tenant Joins Queue
```
Scan QR → parse openhouse://join/{eventId}
    → validate event active + time window
    → waitlistService.joinWaitlist()
    → calculate next position
    → INSERT waitlist_entries
    → realtime broadcast → agent dashboard updates
    → navigate to WaitlistView
    → subscribe to realtime updates
```

### Agent Queue Management
```
EventDashboard subscribes to waitlist:{eventId}
    → "Call Next" → first status=waiting → status=touring, set started_tour_at
    → "Complete" → status=completed, set completed_at
    → "Skip" / "No-Show" → status=skipped/no-show
    → realtime broadcast → tenant screen updates
```

### Application Distribution
```
Agent selects interested tenants (SelectTenantsScreen)
    → applicationService.sendApplicationToTenants()
    → creates application records
    → updates waitlist entries (application_sent=true)
    → calls Supabase Edge Function (send-application-email)
```

## Service Layer

All DB access goes through services — no direct Supabase calls in components.

| Service | Operations |
|---------|-----------|
| propertyService | CRUD, search (city/rent/beds), getAvailableForEvent |
| eventService | CRUD, status transitions (scheduled→active→completed), realtime subscribe |
| waitlistService | join, reorder (RPC), status updates, interest toggle, history, realtime |
| profileService | upload profile pic, upload housing app (Supabase Storage) |
| applicationService | send to tenants, track status (sent/viewed/submitted) |
| emailTemplateService | CRUD templates (AsyncStorage), placeholder replacement |

## Database

### Tables
- **users**: id (FK auth.users), email, phone, name, role, profile_picture, housing_application_url
- **properties**: agent_id (FK), address fields, beds/baths/rent, images[]
- **open_house_events**: property_id (FK), agent_id (FK), start/end time, status, qr_code
- **waitlist_entries**: event_id (FK), user_id (nullable, FK), guest fields, position, status, interest/app flags
- **applications**: event_id, entry_id, property_id, recipient info, status, application_url

### RLS Policies
- users: read/update own
- properties: anyone read, agents CRUD own
- events: anyone read, agents CRUD own
- waitlist: anyone insert, users/agents read own, agents/users update own
- applications: recipients + agents read own

### Key Functions
- `reorder_waitlist_entry(entry_id, new_pos)` — atomic position swap
- `repair_waitlist_positions(event_id)` — fix gaps
- `reorder_waitlist_positions()` — trigger on delete
- `update_updated_at_column()` — auto-timestamp trigger

### Indexes
9 indexes on: agent_id, property_id, event_id, user_id, status, position

## Realtime

Supabase Realtime (PostgreSQL LISTEN/NOTIFY):
- `waitlist:{eventId}` — queue changes
- `event:{eventId}` — event status changes

Subscriptions auto-unsubscribe on component unmount.

## Security

- RLS on all tables
- Clerk tokens in expo-secure-store
- Supabase session in AsyncStorage with auto-refresh
- Input validation on all forms (email, phone, required fields, numeric bounds)
- No sensitive data logged
- `.env` gitignored
- Parameterized queries via Supabase client

## Event Status Machine

```
scheduled ──(start_time reached)──→ active ──(end_time reached)──→ completed
                                      │
                                      └──(manual cancel)──→ cancelled
```

Auto-transition checked on agent refresh (`checkAndTransitionAllAgentEvents`).
