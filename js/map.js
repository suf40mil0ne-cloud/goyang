import { MAP_CONFIG } from './config.js';

const registry = new WeakMap();
let assetsPromise;
let projectionReady = false;

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function colorForStatus(statusKey) {
  if (statusKey === 'closing-soon') return '#ea6b27';
  if (statusKey === 'ended') return '#708599';
  return '#0c5ecf';
}

function ensureStylesheet(url) {
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

function loadScript(url) {
  const existing = document.querySelector(`script[src="${url}"]`);
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function ensureMapAssets() {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      ensureStylesheet(MAP_CONFIG.openLayersCssUrl);
      await loadScript(MAP_CONFIG.proj4ScriptUrl);
      await loadScript(MAP_CONFIG.openLayersScriptUrl);
      await loadScript(MAP_CONFIG.ngiiScriptUrl);
      registerProjection();
    })();
  }

  return assetsPromise;
}

function registerProjection() {
  if (projectionReady || !window.ol || !window.proj4) return;
  window.proj4.defs(
    MAP_CONFIG.projectionCode,
    '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs'
  );
  window.ol.proj.proj4.register(window.proj4);
  projectionReady = true;
}

function resolveOlMap(mapInstance) {
  if (!mapInstance || !window.ol?.Map) return null;
  if (mapInstance instanceof window.ol.Map) return mapInstance;
  if (mapInstance.map instanceof window.ol.Map) return mapInstance.map;

  const queue = [mapInstance];
  const seen = new Set();

  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) continue;
    seen.add(candidate);

    if (candidate instanceof window.ol.Map) return candidate;
    Object.values(candidate).forEach((value) => {
      if (value && typeof value === 'object' && !seen.has(value)) queue.push(value);
    });
  }

  return null;
}

function toProjectedPoint(coordinates, projection) {
  return window.ol.proj.transform(
    [coordinates.lng, coordinates.lat],
    'EPSG:4326',
    projection
  );
}

function createOverlay(element, map) {
  const popupElement = document.createElement('div');
  popupElement.className = 'map-popup';
  popupElement.hidden = true;
  element.appendChild(popupElement);

  const overlay = new window.ol.Overlay({
    element: popupElement,
    autoPan: {
      animation: {
        duration: 200,
      },
    },
    offset: [0, -18],
    positioning: 'bottom-center',
  });

  map.addOverlay(overlay);
  return { popupElement, overlay };
}

function renderPopup(popupElement, notice) {
  popupElement.innerHTML = `
    <strong>${escapeHtml(notice.title)}</strong>
    <span>${escapeHtml(notice.sido)} ${escapeHtml(notice.sigungu)} ${escapeHtml(notice.legalDong)} · ${escapeHtml(notice.statusLabel)}</span>
    <a href="notice.html?id=${encodeURIComponent(notice.id)}">상세 보기</a>
  `;
  popupElement.hidden = false;
}

function createFeatureLayer({ notices, projection, selectedId, currentPosition }) {
  const source = new window.ol.source.Vector();

  notices.forEach((notice) => {
    if (!Number.isFinite(notice.latitude) || !Number.isFinite(notice.longitude)) return;
    const feature = new window.ol.Feature({
      geometry: new window.ol.geom.Point(toProjectedPoint({ lat: notice.latitude, lng: notice.longitude }, projection)),
      notice,
      featureKind: 'notice',
    });

    feature.setStyle(new window.ol.style.Style({
      image: new window.ol.style.Circle({
        radius: notice.id === selectedId ? 9 : 7,
        fill: new window.ol.style.Fill({ color: colorForStatus(notice.statusKey) }),
        stroke: new window.ol.style.Stroke({ color: '#ffffff', width: 2 }),
      }),
    }));

    source.addFeature(feature);
  });

  if (currentPosition) {
    const userFeature = new window.ol.Feature({
      geometry: new window.ol.geom.Point(toProjectedPoint(currentPosition, projection)),
      featureKind: 'current-location',
    });

    userFeature.setStyle(new window.ol.style.Style({
      image: new window.ol.style.Circle({
        radius: 7,
        fill: new window.ol.style.Fill({ color: '#173042' }),
        stroke: new window.ol.style.Stroke({ color: '#ffffff', width: 2 }),
      }),
    }));

    source.addFeature(userFeature);
  }

  return new window.ol.layer.Vector({ source });
}

function fitMapToContent({ map, layer, projection, center, zoom, currentPosition }) {
  const source = layer.getSource();
  const featureCount = source.getFeatures().length;

  if (featureCount > 1) {
    map.getView().fit(source.getExtent(), {
      padding: [36, 36, 36, 36],
      maxZoom: 14,
      duration: 200,
    });
    return;
  }

  const fallbackCenter = currentPosition || center || MAP_CONFIG.defaultCenter;
  map.getView().setCenter(toProjectedPoint(fallbackCenter, projection));
  map.getView().setZoom(zoom || MAP_CONFIG.defaultZoom);
}

function setHybrid(mapInstance, enabled) {
  if (!mapInstance || typeof mapInstance._setHybridMap !== 'function') return;
  mapInstance._setHybridMap(Boolean(enabled));
}

export async function createNoticeMap({
  elementId,
  notices,
  center,
  zoom = MAP_CONFIG.defaultZoom,
  selectedId = '',
  currentPosition = null,
  hybrid = false,
}) {
  await ensureMapAssets();

  const element = document.getElementById(elementId);
  if (!element || !window.ngii_wmts || !window.ol) return null;

  const existing = registry.get(element);
  if (existing?.map) {
    existing.map.setTarget(null);
  }
  element.innerHTML = '';

  const mapInstance = new window.ngii_wmts.map(elementId, {
    mapMode: MAP_CONFIG.ngiiMapMode,
  });
  setHybrid(mapInstance, hybrid);

  const map = resolveOlMap(mapInstance);
  if (!map) throw new Error('NGII OpenLayers map instance could not be resolved.');

  const projection = map.getView().getProjection()?.getCode?.() || MAP_CONFIG.projectionCode;
  const featureLayer = createFeatureLayer({
    notices,
    projection,
    selectedId,
    currentPosition,
  });

  map.addLayer(featureLayer);

  const { popupElement, overlay } = createOverlay(element, map);

  map.on('singleclick', (event) => {
    const feature = map.forEachFeatureAtPixel(event.pixel, (item) => item);
    const notice = feature?.get?.('notice');
    if (!notice) {
      popupElement.hidden = true;
      overlay.setPosition(undefined);
      return;
    }
    renderPopup(popupElement, notice);
    overlay.setPosition(feature.getGeometry().getCoordinates());
  });

  map.on('pointermove', (event) => {
    const hit = map.hasFeatureAtPixel(event.pixel);
    map.getTargetElement().style.cursor = hit ? 'pointer' : '';
  });

  fitMapToContent({
    map,
    layer: featureLayer,
    projection,
    center,
    zoom,
    currentPosition,
  });

  registry.set(element, { map, mapInstance, featureLayer, overlay });
  window.setTimeout(() => map.updateSize(), 0);
  return map;
}
