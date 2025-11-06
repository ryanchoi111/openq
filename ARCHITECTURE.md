# OpenHouse App - Architecture Documentation

## Project Structure

```
openq/
├── src/
│   ├── config/              # App configuration
│   │   └── supabase.ts      # Supabase client setup
│   │
│   ├── contexts/            # React contexts
│   │   └── AuthContext.tsx  # Auth state (guest + Supabase)
│   │
│   ├── navigation/          # React Navigation
│   │   ├── types.ts         # Navigation type definitions
│   │   └── AppNavigator.tsx # Root navigator + routing logic
│   │
│   ├── screens/             # UI screens
│   │   ├── auth/            # Authentication flow
│   │   │   ├── WelcomeScreen.tsx
│   │   │   ├── GuestJoinScreen.tsx
│   │   │   ├── SignInScreen.tsx
│   │   │   └── SignUpScreen.tsx
│   │   │
│   │   ├── tenant/          # Tenant user flow
│   │   │   ├── TenantHomeScreen.tsx
│   │   │   ├── ScanQRScreen.tsx
│   │   │   └── WaitlistViewScreen.tsx
│   │   │
│   │   └── agent/           # Agent user flow
│   │       ├── AgentHomeScreen.tsx
│   │       ├── PropertiesScreen.tsx
│   │       ├── CreatePropertyScreen.tsx
│   │       ├── CreateEventScreen.tsx
│   │       ├── EventDashboardScreen.tsx
│   │       └── QRDisplayScreen.tsx
│   │
│   ├── services/            # Business logic / API layer
│   │   ├── waitlistService.ts   # Queue operations
│   │   ├── eventService.ts      # Open house events
│   │   └── propertyService.ts   # Property CRUD
│   │
│   ├── types/               # TypeScript definitions
│   │   └── index.ts         # Shared types
│   │
│   └── utils/               # Helper functions (empty, ready for utils)
│
├── App.tsx                  # Entry point
├── app.json                 # Expo config
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
├── supabase-schema.sql      # Database schema
├── .env.example             # Env vars template
├── .env                     # Actual credentials (gitignored)
│
└── docs/
    ├── README.md            # Main documentation
    ├── QUICKSTART.md        # 5-min setup
    ├── SETUP_GUIDE.md       # Detailed setup
    ├── PROJECT_SUMMARY.md   # Implementation details
    └── ARCHITECTURE.md      # This file
```

## Data Flow

### Authentication Flow

```
User Opens App
    ↓
AuthContext checks AsyncStorage + Supabase
    ↓
┌───────────────┐
│ No User Found │ → Welcome Screen
└───────────────┘    ↓
                     Choose:
                     ├─ Join as Guest → GuestJoinScreen → Save to AsyncStorage
                     ├─ Sign In → SignInScreen → Supabase Auth
                     └─ Sign Up → SignUpScreen → Supabase Auth + create user record
                         ↓
                    User Authenticated
                         ↓
                    ┌────────────────┐
                    │ Role Check     │
                    └────────────────┘
                         ↓
              ┌──────────┴──────────┐
              ↓                     ↓
         Agent Flow            Tenant Flow
```

### Tenant Queue Flow

```
Tenant Scans QR Code
    ↓
Extract eventId from QR data (openhouse://join/{eventId})
    ↓
waitlistService.joinWaitlist()
    ↓
Calculate position (max + 1)
    ↓
Insert waitlist_entries
    ↓
Supabase Realtime broadcasts to all subscribers
    ↓
Navigate to WaitlistViewScreen
    ↓
Subscribe to realtime updates
    ↓
Display position + status
    ↓
When status changes to 'touring':
    ↓
Show "It's your turn!" alert
    ↓
After tour, show "Express Interest" button
    ↓
If clicked: update expressed_interest = true
    ↓
Agent can send application
```

### Agent Queue Management Flow

```
Agent Creates Open House
    ↓
Select Property → Create Event → Set status = 'active'
    ↓
Generate QR code (openhouse://join/{eventId})
    ↓
Display QR → Tenants scan → Join waitlist
    ↓
Event Dashboard loads waitlist
    ↓
Subscribe to realtime updates
    ↓
Agent clicks "Call Next"
    ↓
Find first entry with status='waiting'
    ↓
Update status='touring', set started_tour_at
    ↓
Realtime broadcast to tenant
    ↓
Tenant's screen updates
    ↓
Agent clicks "Complete"
    ↓
Update status='completed', set completed_at
    ↓
Tenant sees "Express Interest" button
    ↓
If interest expressed: agent sees badge
```

## Component Hierarchy

```
<App>
  <AuthProvider>                    # Global auth state
    <NavigationContainer>
      <RootNavigator>
        {!user ? (
          <AuthNavigator>           # Auth flow
            - WelcomeScreen
            - SignInScreen
            - SignUpScreen
            - GuestJoinScreen
          </AuthNavigator>
        ) : (
          <MainNavigator>           # Main app
            {user.role === 'agent' ? (
              <AgentNavigator>      # Agent stack
                - AgentHomeScreen
                - PropertiesScreen
                - CreatePropertyScreen
                - CreateEventScreen
                - EventDashboardScreen
                - QRDisplayScreen
              </AgentNavigator>
            ) : (
              <TenantNavigator>     # Tenant stack
                - TenantHomeScreen
                - ScanQRScreen
                - WaitlistViewScreen
              </TenantNavigator>
            )}
          </MainNavigator>
        )}
      </RootNavigator>
    </NavigationContainer>
  </AuthProvider>
</App>
```

## Service Layer Pattern

All database operations go through service layers:

```typescript
// Bad: Direct Supabase calls in components
const { data } = await supabase.from('properties').select('*');

// Good: Use service layer
const properties = await propertyService.getAgentProperties(userId);
```

### Benefits:
- Centralized error handling
- Type safety
- Reusability
- Easier testing
- Business logic separation

## State Management

### Global State (AuthContext)
- `user: User | GuestUser | null` - Current user
- `session: Session | null` - Supabase session
- `isGuest: boolean` - Guest mode flag
- `isAuthenticated: boolean` - Auth status
- `loading: boolean` - Initial load state

### Local State (useState)
- Screen-specific data (form inputs, loading flags)
- Fetched data (properties, events, waitlist)

### Persistent State
- AsyncStorage: Guest user data
- Supabase: All other data

## Realtime Architecture

### Subscription Pattern

```typescript
useEffect(() => {
  // Subscribe on mount
  const subscription = waitlistService.subscribeToWaitlist(
    eventId,
    (payload) => {
      // Handle update
      setWaitlist(prev => /* update logic */);
    }
  );

  // Cleanup on unmount
  return () => {
    subscription.unsubscribe();
  };
}, [eventId]);
```

### Channels

- `waitlist:{eventId}` - Queue updates for specific event
- `event:{eventId}` - Event status changes

## Security Model

### Row Level Security (RLS)

**users table**
```sql
-- Users can read own data
CREATE POLICY ON users FOR SELECT
  USING (auth.uid() = id);

-- Users can update own profile
CREATE POLICY ON users FOR UPDATE
  USING (auth.uid() = id);
```

**properties table**
```sql
-- Anyone can read
CREATE POLICY ON properties FOR SELECT
  USING (true);

-- Agents can CRUD own properties
CREATE POLICY ON properties FOR ALL
  USING (auth.uid() = agent_id);
```

**waitlist_entries table**
```sql
-- Anyone can join (for guests)
CREATE POLICY ON waitlist_entries FOR INSERT
  WITH CHECK (true);

-- Users see own entries OR entries they manage
CREATE POLICY ON waitlist_entries FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM open_house_events
      WHERE id = event_id AND agent_id = auth.uid()
    )
  );
```

## Type System

### Core Types

```typescript
// User types
type UserRole = 'agent' | 'tenant' | 'guest';

interface User {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  role: UserRole;
  created_at: string;
}

interface GuestUser {
  id: string;
  name: string;
  phone: string;
  role: 'guest';
}

// Domain types
interface Property { /* ... */ }
interface OpenHouseEvent { /* ... */ }
interface WaitlistEntry { /* ... */ }
interface Application { /* ... */ }
```

### Navigation Types

```typescript
type RootStackParamList = {
  Auth: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
};

type TenantStackParamList = {
  TenantHome: undefined;
  ScanQR: undefined;
  WaitlistView: { eventId: string; entryId: string };
};

type AgentStackParamList = {
  AgentHome: undefined;
  Properties: undefined;
  CreateProperty: undefined;
  CreateEvent: { propertyId?: string };
  EventDashboard: { eventId: string };
  QRDisplay: { eventId: string };
};
```

## Error Handling

### Service Layer

```typescript
try {
  const data = await supabase.from('table').select('*');
  if (error) throw error;
  return data;
} catch (error) {
  console.error('Descriptive error:', error);
  throw error; // Re-throw for UI handling
}
```

### UI Layer

```typescript
try {
  await someService.someMethod();
  Alert.alert('Success', 'Action completed');
} catch (error) {
  Alert.alert('Error', 'User-friendly message');
}
```

## Performance Optimizations

### Applied

1. **FlatList** for long lists (virtualized rendering)
2. **Realtime cleanup** on unmount (prevent memory leaks)
3. **AsyncStorage** for fast guest data access
4. **Database indexes** on frequently queried columns
5. **Type-only imports** where applicable

### Future

1. **React.memo** for expensive components
2. **useMemo/useCallback** for computed values
3. **Image caching** (react-native-fast-image)
4. **Pagination** for large datasets
5. **Offline support** (react-query)

## Testing Strategy

### Unit Tests (Recommended)

```typescript
// services/waitlistService.test.ts
describe('waitlistService', () => {
  test('joinWaitlist calculates position correctly', async () => {
    // Mock Supabase
    // Call function
    // Assert position
  });
});
```

### Integration Tests

```typescript
// flows/waitlist.test.tsx
describe('Waitlist Flow', () => {
  test('tenant can join and see position', async () => {
    // Render ScanQR
    // Mock QR scan
    // Assert navigation to WaitlistView
    // Assert position displayed
  });
});
```

## Deployment Architecture

### Development
```
Developer Machine
    ↓
Expo Dev Server (Metro)
    ↓
iOS Simulator / Android Emulator / Physical Device
    ↓
Supabase (Dev Project)
```

### Production
```
App Store / Google Play
    ↓
User Devices
    ↓
Supabase (Prod Project)
    ↓
OneSignal (Push Notifications)
```

## Environment Configuration

```bash
# Development
.env

# Production (via EAS)
eas.json → build profiles → environment variables
```

## Monitoring & Analytics

### Error Tracking (Recommended)
- Sentry for crash reports
- Log service errors
- Track API response times

### Analytics (Recommended)
- Mixpanel / Amplitude
- Track:
  - Queue join rate
  - Average wait time
  - Interest expression rate
  - Application completion

## Scaling Considerations

### Current Limits (Supabase Free Tier)
- 500 MB database
- 2 GB bandwidth/month
- 200 concurrent realtime connections
- 50,000 monthly active users

### Scaling Path
1. Supabase Pro ($25/mo): 8 GB DB, 50 GB bandwidth
2. Caching layer (Redis)
3. CDN for images
4. Multiple Supabase projects (by region)

## Code Style

- TypeScript strict mode
- Functional components only
- Hooks for state/effects
- Service layer for all API calls
- Props destructuring
- Named exports for components
- PascalCase for components
- camelCase for functions/variables
- Descriptive names (no abbreviations)

## Documentation Standards

Each file has:
- Header comment explaining purpose
- JSDoc for complex functions
- Inline comments for business logic
- Type definitions for all props/params

## Contribution Guidelines

1. Follow existing code style
2. Add types for new features
3. Update relevant service layer
4. Test on iOS + Android
5. Update README if needed
6. No commits to main (use PRs)
