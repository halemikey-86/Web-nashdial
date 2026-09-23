import { useEffect, useState } from 'react';

export type Route =
  | { name: 'dial' }
  | { name: 'songs' }
  | { name: 'song'; id: string }
  | { name: 'song-edit'; id: string | null }
  | { name: 'sets' }
  | { name: 'set'; id: string }
  | { name: 'set-play'; id: string; index: number }
  | { name: 'warmup'; id: string | null }
  | { name: 'drums' }
  | { name: 'tuner' }
  | { name: 'share'; code: string };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, ``).split(`/`).filter(Boolean).map(decodeURIComponent);
  const [a, b, c, d] = parts;
  if (a === `songs`) {
    if (!b) return { name: `songs` };
    if (b === `new`) return { name: `song-edit`, id: null };
    if (c === `edit`) return { name: `song-edit`, id: b };
    return { name: `song`, id: b };
  }
  if (a === `sets`) {
    if (!b) return { name: `sets` };
    if (c === `play`) return { name: `set-play`, id: b, index: Math.max(0, Number(d) || 0) };
    return { name: `set`, id: b };
  }
  if (a === `warmup`) return { name: `warmup`, id: b ?? null };
  if (a === `drums`) return { name: `drums` };
  if (a === `tuner`) return { name: `tuner` };
  if (a === `share` && b) return { name: `share`, code: b };
  return { name: `dial` };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case `dial`:
      return `#/`;
    case `songs`:
      return `#/songs`;
    case `song`:
      return `#/songs/${encodeURIComponent(route.id)}`;
    case `song-edit`:
      return route.id ? `#/songs/${encodeURIComponent(route.id)}/edit` : `#/songs/new`;
    case `sets`:
      return `#/sets`;
    case `set`:
      return `#/sets/${encodeURIComponent(route.id)}`;
    case `set-play`:
      return `#/sets/${encodeURIComponent(route.id)}/play/${route.index}`;
    case `warmup`:
      return route.id ? `#/warmup/${encodeURIComponent(route.id)}` : `#/warmup`;
    case `drums`:
      return `#/drums`;
    case `tuner`:
      return `#/tuner`;
    case `share`:
      return `#/share/${route.code}`;
  }
}

export function navigate(route: Route, { replace = false } = {}): void {
  const hash = routeHash(route);
  if (replace) history.replaceState(null, ``, hash);
  else location.hash = hash;
  if (replace) window.dispatchEvent(new HashChangeEvent(`hashchange`));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener(`hashchange`, onChange);
    return () => window.removeEventListener(`hashchange`, onChange);
  }, []);
  return route;
}
