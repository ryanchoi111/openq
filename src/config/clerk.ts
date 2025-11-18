/**
 * Clerk configuration for Expo
 * 
 * Setup instructions:
 * 1. Get your Clerk publishable key from: https://dashboard.clerk.com
 * 2. Go to your app > API Keys
 * 3. Copy the "Publishable key" (starts with pk_)
 * 4. Add it to your .env file as: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_key_here
 */

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

if (!clerkPublishableKey) {
  console.warn('⚠️  Clerk publishable key not found. Please configure EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in .env file.');
}

export { clerkPublishableKey };

