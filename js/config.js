export const NGII_API_KEY = 'E9B8AF6E7A9BA4D7CA4755AEB74B291753EA42E977';

export const MAP_CONFIG = {
  defaultCenter: { lat: 37.5665, lng: 126.978 },
  defaultZoom: 10,
  ngiiMapMode: 11,
  projectionCode: 'EPSG:5179',
  jqueryScriptUrl: 'https://code.jquery.com/jquery-2.1.1.min.js',
  openLayersCssUrl: 'https://cdn.jsdelivr.net/npm/ol@v6.4.3/ol.css',
  openLayersScriptUrl: 'https://cdn.jsdelivr.net/npm/ol@v6.4.3/dist/ol.js',
  proj4ScriptUrl: 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.4.4/proj4.js',
  ngiiScriptUrl: `https://map.ngii.go.kr/openapi/wmts_ngiiMap_v6.4.3.js?apikey=${NGII_API_KEY}`,
};
