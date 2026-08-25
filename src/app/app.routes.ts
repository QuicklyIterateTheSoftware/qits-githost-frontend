import type { CanMatchFn, Routes, UrlMatchResult, UrlSegment } from '@angular/router';
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

/**
 * One matcher per view, and being ONE is the point: the bare repository address redirects to
 * `branches/<default>` once the default branch is known, and the branch dropdown navigates between
 * refs — if the bare and the spelled forms were separate route configs, every one of those hops
 * would destroy and rebuild the page and re-fetch what it already had. A single config keeps the
 * default `RouteReuseStrategy` reusing the component, so a hop is a signal change, not a reload.
 * A slashy branch also falls out for free: the matcher consumes the whole tail, so
 * `branches/feature/x` is one ref that the page re-reads from the URL.
 */
function treeMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length === 0 || segments[0].path === 'branches') {
    return { consumed: segments };
  }
  return null;
}

function commitsMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  return segments[0]?.path === 'commits' ? { consumed: segments } : null;
}

const REPOSITORY: Routes = [
  { path: 'commit/:sha', component: CommitPage },
  { matcher: commitsMatcher, component: CommitsPage },
  { matcher: treeMatcher, component: CodePage },
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
