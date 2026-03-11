const AREA_KEY = 'upr_saved_areas_v2';
const KEYWORD_KEY = 'upr_saved_keywords_v1';
const PREFERRED_REGION_KEY = 'upr_preferred_region_v1';

export function loadSavedAreas() {
  try {
    const raw = localStorage.getItem(AREA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

export function saveArea(entry) {
  const current = loadSavedAreas();
  const next = [entry, ...current.filter((item) => item.label !== entry.label)].slice(0, 6);
  localStorage.setItem(AREA_KEY, JSON.stringify(next));
  return next;
}

export function removeArea(label) {
  const next = loadSavedAreas().filter((item) => item.label !== label);
  localStorage.setItem(AREA_KEY, JSON.stringify(next));
  return next;
}

export function loadSavedKeywords() {
  try {
    const raw = localStorage.getItem(KEYWORD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

export function saveKeyword(keyword) {
  const normalized = String(keyword || '').trim();
  if (!normalized) return loadSavedKeywords();
  const current = loadSavedKeywords();
  const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, 8);
  localStorage.setItem(KEYWORD_KEY, JSON.stringify(next));
  return next;
}

export function removeKeyword(keyword) {
  const next = loadSavedKeywords().filter((item) => item !== keyword);
  localStorage.setItem(KEYWORD_KEY, JSON.stringify(next));
  return next;
}

export function loadPreferredRegion() {
  try {
    const raw = localStorage.getItem(PREFERRED_REGION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function savePreferredRegion(region) {
  if (!region) return null;
  const next = {
    sido: region.sido,
    sigungu: region.sigungu,
    fullName: region.fullName || `${region.sido} ${region.sigungu}`,
  };
  localStorage.setItem(PREFERRED_REGION_KEY, JSON.stringify(next));
  return next;
}
