import { InjectionToken } from '@angular/core';

/**
 * The origin every request in this app is built on, and it is empty on purpose.
 *
 * The SPA is served at `/githost/` by qits-githost itself, which also answers `/githost/api/…` — so
 * a same-origin absolute path is not a shortcut, it is what keeps these reads free of CORS and of
 * any credential. A configured base URL would move them cross-origin and buy nothing.
 *
 * It is a token rather than a constant for one reason: a spec needs a seam to assert the path
 * against, and `ng serve` (no service in front) may want the dev proxy's prefix. Same shape as
 * spa-artifacts, spa-ci and spa-cd; it adds no behaviour, only a handle.
 */
export const QITS_API_BASE = new InjectionToken<string>('qits.api-base', {
  providedIn: 'root',
  factory: () => '',
});
