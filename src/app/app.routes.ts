import type { CanMatchFn, Routes, UrlSegment } from '@angular/router';
import { QitsMainLayout, QITS_CATEGORIES, type QitsCategory } from '@qits/ui-components';
import { CodePage } from './code/code-page';
import { NotFound } from './not-found/not-found';
import { OrphanedRepositoriesPage } from './repositories/orphaned-repositories-page';

/**
 * Two pages, inside the platform chrome.
 *
 * `QitsMainLayout` is the root *route* component rather than something the shell templates, so the
 * bar and the navigation mount once and survive every navigation beneath them.
 *
 * **The address starts at the root**, because this application is served at `/` on its own host.
 * The root is the host's own view — the orphaned repositories, the storage facts nothing else can
 * state — and `/<slug>/<category>/<repo>/…` is the Code page: the repository's contents, read from
 * the bare storage. The repository form is what the platform's `Code` navigation entries link to,
 * so this app routes `repository`-deep now rather than being a pure `system` app.
 *
 * **Everything after the repository segment is the rev** — `/qits/services/qits-ci/main`, or a
 * feature branch with its slashes intact, or a sha. It is a wildcard child rather than `:rev`
 * because a branch name may hold `/` and a rev is optional; no tail means the default branch. The
 * open file stays a query parameter (`?path=…`, `?lines=12-20`): a rev is a place and earns the
 * path, a file is addressable state within it — the same grammar the workspaces file browser
 * settled on.
 *
 * The `**` route sits inside the layout too: this host is this application's outright, so an
 * unknown URL on it is an ordinary 404 and is drawn with the chrome around it.
 */
const OWN: Routes = [{ path: '', component: OrphanedRepositoriesPage }];

/**
 * Whether the address is really `/<slug>/<category>/<repo>/…` and not a page of this app's own.
 * The second segment is the discriminator because its vocabulary is closed — copied verbatim from
 * the sibling SPAs, where the reasoning lives (see spa-artifacts' routes).
 */
export const categoryIsKnown: CanMatchFn = (_route, segments: UrlSegment[]) =>
  QITS_CATEGORIES.includes(segments[1]?.path as QitsCategory);

/**
 * The `:project` form exists because the chrome's project picker navigates to `/<slug>` — without
 * it every pick would land on the 404 page. It shows the same catalogue: orphaned repositories are
 * a host-wide fact, not a project's.
 *
 * The pages read `inject(QITS_SCOPE).scope()` rather than these params; the Code page reads the
 * rev tail from the URL itself, because a wildcard match has no named param to read.
 */
export const routes: Routes = [
  {
    path: '',
    component: QitsMainLayout,
    children: [
      ...OWN,
      {
        path: ':project/:category/:repository',
        canMatch: [categoryIsKnown],
        children: [
          { path: '', component: CodePage },
          { path: '**', component: CodePage },
        ],
      },
      { path: ':project', children: OWN },
      { path: '**', component: NotFound },
    ],
  },
];
