// Hash router. Routes:
//   #/                  → { name: 'list' }
//   #/light/<localId>   → { name: 'detail', localId }

export function parseRoute(hash = location.hash) {
  const path = (hash || '').replace(/^#/, '');
  if (!path || path === '/') return { name: 'list' };
  const m = path.match(/^\/light\/([^/]+)$/);
  if (m) return { name: 'detail', localId: m[1] };
  return { name: 'list' }; // unknown route → home
}

export function navigate(routeName, params = {}) {
  if (routeName === 'list') {
    location.hash = '#/';
  } else if (routeName === 'detail') {
    location.hash = `#/light/${params.localId}`;
  }
}

// Back-button safe: if no history, go to list instead of exiting.
export function back() {
  if (history.length > 1) {
    history.back();
  } else {
    navigate('list');
  }
}

export function onRouteChange(callback) {
  window.addEventListener('hashchange', () => callback(parseRoute()));
}
