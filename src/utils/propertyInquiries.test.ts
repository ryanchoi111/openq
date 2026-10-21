import { describe, expect, it } from 'vitest';
import type { ListingType, PropertyLabel, TourRequest } from '../types/gmail';
import { buildPropertyInquiryGroups, type ListingTypeFilter } from './propertyInquiries';

function inquiry(
  id: string,
  propertyAddress: string,
  listingType: ListingType,
  label: PropertyLabel = 'none',
  receivedAt = '2026-01-01T12:00:00.000Z',
): TourRequest {
  return {
    id,
    clientName: `Client ${id}`,
    clientEmail: `${id}@example.com`,
    propertyAddress,
    rawSubject: 'Inquiry',
    receivedAt,
    gmailMessageId: `gmail-${id}`,
    agentEmail: 'agent@example.com',
    source: 'streeteasy',
    listingType,
    label,
  };
}

function groups(
  tourRequests: TourRequest[],
  labelFilter: PropertyLabel | 'all' = 'all',
  listingTypeFilter: ListingTypeFilter = 'all',
) {
  return buildPropertyInquiryGroups({
    tourRequests,
    labelFilter,
    listingTypeFilter,
    sortNewestFirst: true,
  });
}

describe('buildPropertyInquiryGroups', () => {
  it('returns all listing groups sorted newest first', () => {
    const result = groups([
      inquiry('old', '10 First St', 'rent', 'none', '2026-01-01T12:00:00.000Z'),
      inquiry('new', '20 Second St', 'sale', 'none', '2026-01-02T12:00:00.000Z'),
    ]);

    expect(result.map((group) => group.propertyAddress)).toEqual(['20 Second St', '10 First St']);
    expect(result.map((group) => group.listingTypes)).toEqual([['sale'], ['rent']]);
  });

  it('filters rent-only properties', () => {
    const result = groups(
      [
        inquiry('rent', '10 First St', 'rent'),
        inquiry('sale', '20 Second St', 'sale'),
      ],
      'all',
      'rent',
    );

    expect(result.map((group) => group.propertyAddress)).toEqual(['10 First St']);
  });

  it('filters sale-only properties', () => {
    const result = groups(
      [
        inquiry('rent', '10 First St', 'rent'),
        inquiry('sale', '20 Second St', 'sale'),
      ],
      'all',
      'sale',
    );

    expect(result.map((group) => group.propertyAddress)).toEqual(['20 Second St']);
  });

  it('includes mixed properties under rent and sale filters', () => {
    const mixed = [
      inquiry('rent', '10 First St', 'rent', 'none', '2026-01-01T12:00:00.000Z'),
      inquiry('sale', '10 First St', 'sale', 'none', '2026-01-02T12:00:00.000Z'),
    ];

    expect(groups(mixed, 'all', 'rent').map((group) => group.propertyAddress)).toEqual(['10 First St']);
    expect(groups(mixed, 'all', 'sale').map((group) => group.propertyAddress)).toEqual(['10 First St']);
    expect(groups(mixed)[0].listingTypes.sort()).toEqual(['rent', 'sale']);
  });

  it('combines label and listing-type filters', () => {
    const result = groups(
      [
        inquiry('available-rent', '10 First St', 'rent', 'available'),
        inquiry('processing-sale', '20 Second St', 'sale', 'processing'),
        inquiry('available-sale', '30 Third St', 'sale', 'available'),
      ],
      'available',
      'sale',
    );

    expect(result.map((group) => group.propertyAddress)).toEqual(['30 Third St']);
  });
});
