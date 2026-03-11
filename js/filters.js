function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function haversineKm(from, to) {
  const earthRadius = 6371;
  const latDiff = toRadians(to.lat - from.lat);
  const lngDiff = toRadians(to.lng - from.lng);
  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeRegionText(value = "") {
  return String(value).replace(/\s+/g, "").trim();
}

export function matchesDistrict(notice, region) {
  if (!notice || !region) return false;
  return (
    normalizeRegionText(notice.sido) === normalizeRegionText(region.sido) &&
    normalizeRegionText(notice.sigungu) === normalizeRegionText(region.sigungu)
  );
}

export function filterByStatus(notices, filterKey) {
  if (filterKey === "all") return notices;
  if (filterKey === "active") return notices.filter((notice) => notice.statusKey === "active" || notice.statusKey === "closing-soon");
  if (filterKey === "closing-soon") return notices.filter((notice) => notice.statusKey === "closing-soon");
  if (filterKey === "recent") return notices.filter((notice) => notice.isRecent);
  if (filterKey === "ended") return notices.filter((notice) => notice.statusKey === "ended");
  return notices;
}

export function getNearbyNotices(notices, center, radiusKm, statusFilter = "active") {
  return filterByStatus(notices, statusFilter)
    .map((notice) => ({
      ...notice,
      distanceKm: haversineKm(center, { lat: notice.latitude, lng: notice.longitude }),
    }))
    .filter((notice) => notice.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm || new Date(b.postedDate) - new Date(a.postedDate));
}

export function sortForCards(notices) {
  const priority = { "closing-soon": 0, active: 1, ended: 2 };
  return [...notices].sort((a, b) => {
    const priorityDiff = priority[a.statusKey] - priority[b.statusKey];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.hearingEndDate) - new Date(b.hearingEndDate) || new Date(b.postedDate) - new Date(a.postedDate);
  });
}

export function getDistrictNotices(notices, region, filterKey = "active") {
  return sortForCards(filterByStatus(notices.filter((notice) => matchesDistrict(notice, region)), filterKey));
}
