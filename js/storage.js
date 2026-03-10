const STORAGE_KEY = "upr_saved_areas_v1";

export function loadSavedAreas() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeArea(label) {
  const next = loadSavedAreas().filter((item) => item.label !== label);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
