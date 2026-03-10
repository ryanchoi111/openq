/**
 * Gmail monitoring & Zillow email detection types
 */

/** Parsed Zillow tour request data */
export interface ZillowTourRequest {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  propertyAddress: string;
  rawSubject: string;
  receivedAt: string;
  gmailMessageId: string;
  agentEmail: string;
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
  refreshToken: string;
  historyId: string;
  watchExpiration: string;
  needsReauth: boolean;
}

/** Gmail webhook processing result */
export interface WebhookProcessingResult {
  emailAddress: string;
  messagesProcessed: number;
  zillowEmailsFound: ZillowTourRequest[];
  errors: string[];
}
