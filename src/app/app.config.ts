import { provideBrowserGlobalErrorListeners, type ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideQitsNavigation, provideQitsProjects } from '@qits/ui-components';

import { routes } from './app.routes';

/**
 * Five providers, in the order spa-home documents and every sibling repeats.
 *
 * - `provideBrowserGlobalErrorListeners` funnels global errors and unhandled rejections into
 *   Angular's `ErrorHandler`.
 * - `provideRouter` carries this app's state in the URL, so every view is bookmarkable.
 * - `withFetch` is not a preference. The default XHR backend is invisible to OTLP fetch
 *   instrumentation, so choosing it would quietly forfeit client spans the moment this deployment
 *   grows a telemetry relay. Every call this app makes is a same-origin path and carries no
 *   credential.
 * - `provideQitsNavigation` gives `QitsMainLayout` its left navigation, by asking the gateway for
 *   `/main-navigation` once at startup. Without it the chrome renders no links at all. It needs the
 *   `provideHttpClient` above.
 * - `provideQitsProjects` puts the project picker in the chrome's top-left slot, where the wordmark
 *   was, from one `GET /projects/api/projects`. Every resource on this platform belongs to a
 *   project, so which one is open is the outermost fact about a page rather than a filter inside
 *   one of them — above the links, because it scopes them. It also installs the library's default
 *   scope, which carries a pick in `?project=` on the current URL; the pages here do not read that
 *   parameter yet, and the picker is the chrome's regardless of which of them have been scoped.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideQitsNavigation(),
    provideQitsProjects(),
  ],
};
