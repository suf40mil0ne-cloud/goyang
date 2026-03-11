export const NGII_API_KEY = 'E9B8AF6E7A9BA4D7CA4755AEB74B291753EA42E977';

export const MAP_CONFIG = {
  defaultCenter: { lat: 37.5665, lng: 126.978 },
  defaultZoom: 10,
  ngiiMapMode: 11,
  projectionCode: 'EPSG:5179',
  jqueryScriptUrl: 'https://www.ngii.go.kr/nlsc/emap/js/jquery/jquery-2.1.1.min.js',
  openLayersCssUrl: 'https://www.ngii.go.kr/nlsc/emap/css/map/OpenLayers-6.4.3.css',
  openLayersScriptUrl: 'https://www.ngii.go.kr/nlsc/emap/js/map/OpenLayers-6.4.3.js',
  proj4ScriptUrl: 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.4.4/proj4.js',
  ngiiScriptUrl: `https://map.ngii.go.kr/openapi/wmts_ngiiMap_v6.4.3.js?apikey=${NGII_API_KEY}`,
};
