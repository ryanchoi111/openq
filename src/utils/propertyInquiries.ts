import type { ListingType, PropertyLabel, TourRequest } from '../types/gmail';

export type ListingTypeFilter = 'all' | ListingType;

export interface PropertyInquiryGroup {
  propertyAddress: string;
  requests: TourRequest[];
  mostRecent: TourRequest;
  sources: ('zillow' | 'streeteasy')[];
  listingTypes: ListingType[];
  label: PropertyLabel;
}

interface BuildPropertyInquiryGroupsParams {
  tourRequests: TourRequest[];
  labelFilter: PropertyLabel | 'all';
  listingTypeFilter: ListingTypeFilter;
  sortNewestFirst: boolean;
}

export function buildPropertyInquiryGroups({
  tourRequests,
  labelFilter,
  listingTypeFilter,
  sortNewestFirst,
}: BuildPropertyInquiryGroupsParams): PropertyInquiryGroup[] {
  const groupMap = new Map<string, TourRequest[]>();
  for (const req of tourRequests) {
    const key = req.propertyAddress || 'Unknown Address';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(req);
  }

  const groups: PropertyInquiryGroup[] = [];
  for (const [address, requests] of groupMap) {
    const sorted = [...requests].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    );
    const sourceSet = new Set<'zillow' | 'streeteasy'>();
    const listingTypeSet = new Set<ListingType>();
    for (const r of requests) {
      if (r.source) sourceSet.add(r.source);
      listingTypeSet.add(r.listingType ?? 'rent');
    }
    groups.push({
      propertyAddress: address,
      requests: sorted,
      mostRecent: sorted[0],
      sources: Array.from(sourceSet),
      listingTypes: Array.from(listingTypeSet),
      label: sorted[0]?.label ?? 'none',
    });
  }

  return groups
    .filter((group) => labelFilter === 'all' || group.label === labelFilter)
    .filter(
      (group) =>
        listingTypeFilter === 'all' || group.listingTypes.includes(listingTypeFilter),
    )
    .sort((a, b) => {
      const diff =
        new Date(b.mostRecent.receivedAt).getTime() -
        new Date(a.mostRecent.receivedAt).getTime();
      return sortNewestFirst ? diff : -diff;
    });
}
