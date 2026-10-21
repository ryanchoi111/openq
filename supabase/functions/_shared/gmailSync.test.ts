import {
  detectEmailSource,
  parseStreetEasyEmail,
  parseZillowEmail,
} from './gmailSync.ts';

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${expected}, got ${actual}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

Deno.test('parses StreetEasy sale agent inquiry emails', () => {
  const headers = [
    { name: 'From', value: 'StreetEasy <noreply@email.streeteasy.com>' },
    { name: 'Subject', value: 'Agent Inquiry | 90 William Street #8C | Uzi Ben-David' },
  ];
  const body = `
    Uzi Ben-David is interested in this property.
    uzi@example.com
    (917) 555-1212
  `;

  assertEquals(detectEmailSource(headers, body), 'streeteasy');
  const parsed = parseStreetEasyEmail(headers, body);

  assert(parsed, 'Expected StreetEasy sale email to parse');
  assertEquals(parsed.clientName, 'Uzi Ben-David');
  assertEquals(parsed.clientEmail, 'uzi@example.com');
  assertEquals(parsed.clientPhone, '(917) 555-1212');
  assertEquals(parsed.propertyAddress, '90 William Street #8C');
  assertEquals(parsed.source, 'streeteasy');
  assertEquals(parsed.listingType, 'sale');
});

Deno.test('parses StreetEasy rental inquiry emails', () => {
  const headers = [
    { name: 'From', value: 'StreetEasy <noreply@email.streeteasy.com>' },
    { name: 'Subject', value: '123 Main Street #4B StreetEasy Inquiry From Jane Renter' },
  ];
  const body = `
    Jane Renter Has Requested a Tour for 123 Main Street #4B
    jane@example.com
    212-555-3434
  `;

  assertEquals(detectEmailSource(headers, body), 'streeteasy');
  const parsed = parseStreetEasyEmail(headers, body);

  assert(parsed, 'Expected StreetEasy rental email to parse');
  assertEquals(parsed.clientName, 'Jane Renter');
  assertEquals(parsed.clientEmail, 'jane@example.com');
  assertEquals(parsed.clientPhone, '212-555-3434');
  assertEquals(parsed.propertyAddress, '123 Main Street #4B');
  assertEquals(parsed.listingType, 'rent');
});

Deno.test('parses Zillow rental inquiry emails', () => {
  const body = `
    New Contact John Tenant says:
    I would like to schedule a tour.
    john@example.com
    555-222-1111
    456 Park Ave, New York, NY
  `;

  const parsed = parseZillowEmail(body);

  assert(parsed, 'Expected Zillow rental email to parse');
  assertEquals(parsed.clientName, 'John Tenant');
  assertEquals(parsed.clientEmail, 'john@example.com');
  assertEquals(parsed.clientPhone, '555-222-1111');
  assertEquals(parsed.propertyAddress, '456 Park Ave, New York, NY');
  assertEquals(parsed.source, 'zillow');
  assertEquals(parsed.listingType, 'rent');
});

Deno.test('handles missing StreetEasy phone and email fields', () => {
  const headers = [
    { name: 'From', value: 'StreetEasy <noreply@email.streeteasy.com>' },
    { name: 'Subject', value: 'Agent Inquiry | 90 William Street #8C | Uzi Ben-David' },
  ];

  const parsed = parseStreetEasyEmail(headers, 'Interested in this property.');

  assert(parsed, 'Expected StreetEasy email without contact fields to parse');
  assertEquals(parsed.clientEmail, '');
  assertEquals(parsed.clientPhone, undefined);
  assertEquals(parsed.listingType, 'sale');
});

Deno.test('returns null for Zillow emails missing required email', () => {
  const parsed = parseZillowEmail(`
    New Contact John Tenant says:
    I would like to schedule a tour.
    456 Park Ave, New York, NY
  `);

  assertEquals(parsed, null);
});
