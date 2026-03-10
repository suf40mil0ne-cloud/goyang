const registry = new WeakMap();

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function colorForStatus(statusKey) {
  if (statusKey === "closing-soon") return "#ea6b27";
  if (statusKey === "ended") return "#708599";
  return "#0c5ecf";
}

export function createNoticeMap({ elementId, notices, center, zoom = 11, radiusKm = 0, selectedId = "" }) {
  if (!window.L) return null;
  const element = document.getElementById(elementId);
  if (!element) return null;

  const existingMap = registry.get(element);
  if (existingMap) {
    existingMap.remove();
  }

  const map = L.map(element, {
    zoomControl: true,
    attributionControl: true,
  }).setView([center.lat, center.lng], zoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const bounds = [];

  notices.forEach((notice) => {
    const marker = L.circleMarker([notice.latitude, notice.longitude], {
      radius: notice.id === selectedId ? 10 : 8,
      fillColor: colorForStatus(notice.statusKey),
      fillOpacity: 0.8,
      color: "#ffffff",
      weight: 2,
    }).addTo(map);

    marker.bindPopup(
      `<strong>${escapeHtml(notice.title)}</strong><span>${escapeHtml(notice.sigungu)} ${escapeHtml(notice.legalDong)} · ${escapeHtml(notice.statusLabel)}</span><br><a href="notice.html?id=${encodeURIComponent(notice.id)}">상세 보기</a>`
    );
    bounds.push([notice.latitude, notice.longitude]);
  });

  if (radiusKm > 0) {
    L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000,
      color: "#0c5ecf",
      fillColor: "#0c5ecf",
      fillOpacity: 0.06,
      weight: 1.5,
    }).addTo(map);
  }

  L.circleMarker([center.lat, center.lng], {
    radius: 7,
    fillColor: "#173042",
    fillOpacity: 0.9,
    color: "#ffffff",
    weight: 2,
  })
    .addTo(map)
    .bindPopup("검색 기준 위치");

  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [28, 28] });
  }

  registry.set(element, map);
  return map;
}
