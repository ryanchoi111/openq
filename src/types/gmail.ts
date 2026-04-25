/**
 * Gmail monitoring & tour request email detection types (Zillow, StreetEasy)
 */

export type PropertyLabel = 'none' | 'available' | 'processing' | 'rented';

/** Parsed tour request data (Zillow or StreetEasy) */
export interface TourRequest {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  propertyAddress: string;
  rawSubject: string;
  receivedAt: string;
  gmailMessageId: string;
  agentEmail: string;
  source?: 'zillow' | 'streeteasy';
  label: PropertyLabel;
}

/** Gmail Pub/Sub push notification payload */
export interface GmailPubSubMessage {
  message: {
    data: string; // base64 encoded JSON: { emailAddress, historyId }
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

/** Decoded Pub/Sub notification data */
export interface GmailNotificationData {
  emailAddress: string;
  historyId: string;
}

/** Gmail watch response */
export interface GmailWatchResponse {
  historyId: string;
  expiration: string;
}

/** Agent Gmail connection state */
export interface AgentGmailConnection {
  agentId: string;
  email: string;
  refreshToken?: string;
  historyId: string;
  watchExpiration: string;
  needsReauth: boolean;
}

/** Gmail webhook processing result */
export interface WebhookProcessingResult {
  emailAddress: string;
  messagesProcessed: number;
  tourEmailsFound: TourRequest[];
  errors: string[];
}
