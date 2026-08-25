import type { CanMatchFn, Routes, UrlSegment } from '@angular/router';
import { QitsMainLayout, QITS_CATEGORIES, type QitsCategory } from '@qits/ui-components';
import { CodePage } from './code/code-page';
import { CommitPage } from './code/commit-page';
import { CommitsPage } from './code/commits-page';
import { NotFound } from './not-found/not-found';
import { OrphanedRepositoriesPage } from './repositories/orphaned-repositories-page';

/**
 * The pages, inside the platform chrome.
 *
 * `QitsMainLayout` is the root *route* component rather than something the shell templates, so the
 * bar and the navigation mount once and survive every navigation beneath them.
 *
 * **The address starts at the root**, because this application is served at `/` on its own host.
 * The root is the host's own view — the orphaned repositories, the storage facts nothing else can
 * state — and under `/<slug>/<category>/<repo>/` live the repository views, in the grammar every
 * code host taught its readers:
 *
 * - `…/<repo>` and `…/<repo>/branches/<ref…>` — the tree at a rev (the Code page). The bare form
 *   is the default branch, which is what the platform's `Code` navigation entries link to; the
 *   `branches/` form spells the ref, with a slashy branch name keeping its slashes as segments.
 * - `…/<repo>/commits[/<ref…>]` — the branch's log: everything on the default branch, and on any
 *   other branch only what its parent does not have yet (qits-projects computes the range).
 * - `…/<repo>/commit/<sha>` — one commit, as the same two-pane view scoped to what it changed:
 *   the touched files on the left, the unified diff of the open one on the right.
 *
 * A rev is a **wildcard tail** rather than `:rev` because a branch name may hold `/`; a commit is
 * `:sha` because a sha never does. The open file stays a query parameter (`?path=…`, and
 * `?lines=12-20` on the tree view): a rev or a commit is a place and earns the path, a file is
 * addressable state within it — the workspaces file browser's grammar, kept.
 *
 * The `**` route sits inside the layout too: this host is this application's outright, so an
 * unknown URL on it is an ordinary 404 and is drawn with the chrome around it.
 */
const OWN: Routes = [{ path: '', component: OrphanedRepositoriesPage }];

const REPOSITORY: Routes = [
  { path: '', component: CodePage },
  // A slashy branch holds more segments than a param could: the `**` child catches the whole
  // tail and the pages re-read it from the URL, so `branches/feature/x` is one ref.
  {
    path: 'branches',
    children: [
      { path: '', component: CodePage },
      { path: '**', component: CodePage },
    ],
  },
  {
    path: 'commits',
    children: [
      { path: '', component: CommitsPage },
      { path: '**', component: CommitsPage },
    ],
  },
  { path: 'commit/:sha', component: CommitPage },
];

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
 * The pages read `inject(QITS_SCOPE).scope()` rather than these params; the rev tail they read
 * from the URL itself, because a wildcard match has no named param to read.
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
        children: REPOSITORY,
      },
      { path: ':project', children: OWN },
      { path: '**', component: NotFound },
    ],
  },
];
