import { provideBrowserGlobalErrorListeners, type ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import {
  provideQitsNavigation,
  provideQitsProjects,
  provideQitsScope,
} from '@qits/ui-components';

import { routes } from './app.routes';

/**
 * Six providers, in the order every sibling repeats.
 *
 * - `provideBrowserGlobalErrorListeners` funnels global errors and unhandled rejections into
 *   Angular's `ErrorHandler`.
 * - `provideRouter` carries this app's state in the URL, so every view is bookmarkable.
 * - `withFetch` is not a preference. The default XHR backend is invisible to OTLP fetch
 *   instrumentation, so choosing it would quietly forfeit client spans the moment this deployment
 *   grows a telemetry relay. Every call this app makes is a same-origin path and carries no
 *   credential.
 * - `provideQitsNavigation` gives `QitsMainLayout` its left navigation, by asking the edge for
 *   `/main-navigation` once at startup. Without it the chrome renders no links at all. It needs the
 *   `provideHttpClient` above.
 * - `provideQitsProjects` puts the project picker in the chrome's top-left slot, where the wordmark
 *   was, from one `GET /projects/api/projects`. Every resource on this platform belongs to a
 *   project, so which one is open is the outermost fact about a page rather than a filter inside
 *   one of them — above the links, because it scopes them. It also installs the repositories of
 *   whatever project is in scope, which the sidebar draws.
 * - `provideQitsScope('repository')` says how deep this application's own addresses go: to a
 *   repository. The Code pages live at `/<slug>/<group>/<repo>/…`, which is the address the
 *   platform's per-repository `Code` navigation entries link to — so picking a project navigates
 *   in-app to `/<slug>` rather than leaving for qits-projects, and `QITS_SCOPE.repositoryId()`
 *   resolves the repository name in the address to the storage UUID this host keys by. The scope
 *   comes from the path, never a query parameter; without this provider the picker is not rendered
 *   at all.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideQitsNavigation(),
    provideQitsProjects(),
    provideQitsScope('repository'),
  ],
};
