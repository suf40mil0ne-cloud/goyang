const routes = {
  home: () => import('./js/app.js').then((module) => module.initHomePage()),
  detail: () => import('./js/detail.js').then((module) => module.initDetailPage()),
  region: () => import('./js/region.js').then((module) => module.initRegionPage()),
  map: () => import('./js/map-page.js').then((module) => module.initMapPage()),
  timeline: () => import('./js/timeline.js').then((module) => module.initTimelinePage()),
};

const page = document.body.dataset.page;
if (page && routes[page]) {
  routes[page]().catch((error) => {
    console.error(error);
  });
}
