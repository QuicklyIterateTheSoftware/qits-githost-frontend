import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { QITS_REPOSITORIES, QITS_SCOPE } from '@qits/ui-components';
import { BrowseApi, browseErrorCode } from '../api/browse-api';
import type { RepoDescribeDto, TreeListingDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { FileTree } from './file-tree';
import { FileViewer } from './file-viewer';
import { parseRange } from './line-range';
import { ancestorDirs, buildTree, flatten, type TreeRow } from './tree-model';

/**
 * The Code page: one repository's committed contents, read from the bare storage — the page the
 * platform's per-repository `Code` navigation entries land on.
 *
 * ## The address is the state
 *
 * `/<slug>/<category>/<repo>/<rev…>?path=…&lines=…`. The rev is the URL tail — every segment past
 * the repository, so a `feature/x` branch keeps its slash — and no tail means the default branch,
 * which the service resolves so this page never has to know it before asking. The open file and
 * the painted range are query parameters, read from the URL and never off a click, so a click, a
 * paste, a reload and the back button are one code path — the grammar the workspaces file browser
 * settled and this page repeats.
 *
 * ## What a load costs
 *
 * `1 + 1 + 1`: the describe (branches and default branch), the whole tree at the rev in one eager
 * read, and one read per opened file. Directories cost nothing — they are derived from the paths.
 *
 * ## Who resolves the name
 *
 * The URL spells the repository by name; this host stores it by the UUID qits-projects mints.
 * `QITS_SCOPE.repositoryId()` is that join, resolved client-side from the lists the chrome already
 * loads — so "still resolving", "no such repository in this project" and "known to the platform
 * but not on this host yet" are three different screens, each said outright.
 */
@Component({
  selector: 'app-code-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, FileTree, FileViewer],
  templateUrl: './code-page.html',
  styleUrls: ['../ui/page.css', './code-page.css'],
})
export class CodePage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(BrowseApi);
  private readonly scope = inject(QITS_SCOPE);
  private readonly repositorySource = inject(QITS_REPOSITORIES, { optional: true });

  /** The address, seeded and then fed by the router — the same pattern `UrlScope` uses. */
  private readonly url = signal(this.router.url);

  protected readonly scoped = computed(() => this.scope.scope());

  /** The storage UUID, once the chrome's repository list has answered and the name matched. */
  protected readonly repoId = computed(() => this.scope.repositoryId());

  /** Why there is no id yet — the three honest answers, told apart for the template. */
  protected readonly resolution = computed<'resolved' | 'resolving' | 'failed' | 'unknown'>(() => {
    if (this.repoId()) {
      return 'resolved';
    }
    if (!this.repositorySource || this.repositorySource.repositories() === undefined) {
      return this.repositorySource?.failed() ? 'failed' : 'resolving';
    }
    return this.repositorySource.failed() ? 'failed' : 'unknown';
  });

  private readonly parsedUrl = computed(() => this.router.parseUrl(this.url()));

  /**
   * The rev the address states: every segment past `…/<repo>/branches`, slashes intact. The bare
   * repository address has no `branches` segment and means the default branch — that spelling is
   * what the platform's `Code` navigation entries link to.
   */
  protected readonly revTail = computed(() => {
    const segments = this.parsedUrl().root.children['primary']?.segments ?? [];
    if (segments[3]?.path !== 'branches') {
      return '';
    }
    return segments
      .slice(4)
      .map((segment) => segment.path)
      .join('/');
  });

  protected readonly selectedPath = computed(
    () => this.parsedUrl().queryParamMap.get('path'),
  );

  protected readonly anchor = computed(() =>
    parseRange(this.parsedUrl().queryParamMap.get('lines')),
  );

  protected readonly describe = signal<Loadable<RepoDescribeDto>>(LOADING);
  protected readonly tree = signal<Loadable<TreeListingDto>>(LOADING);

  /** Directory paths the user has opened. Reset when a different tree arrives. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  private describedFor: string | null = null;
  private treeFor: string | null = null;

  constructor() {
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.url.set(this.router.url);
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());

    effect(() => {
      const repoId = this.repoId();
      untracked(() => {
        if (repoId && this.describedFor !== repoId) {
          this.describedFor = repoId;
          void this.loadDescribe(repoId);
        }
      });
    });

    // The tree read waits for the describe: an empty repository is said through its empty branch
    // list, and asking for its tree would only manufacture a no-such-rev error to not draw.
    effect(() => {
      const repoId = this.repoId();
      const described = this.describe();
      const rev = this.revTail();
      untracked(() => {
        if (!repoId || described.kind !== 'ready') {
          return;
        }
        if (described.value.branches.length === 0 && rev === '') {
          return;
        }
        const key = `${repoId}@${rev}`;
        if (this.treeFor !== key) {
          this.treeFor = key;
          void this.loadTree(repoId, rev);
        }
      });
    });

    // A deep-linked file arrives with its ancestors closed; open them. Merging rather than
    // replacing keeps whatever the user had opened besides.
    effect(() => {
      const state = this.tree();
      const path = this.selectedPath();
      untracked(() => {
        if (state.kind !== 'ready' || !path) {
          return;
        }
        const missing = ancestorDirs(path).filter((dir) => !this.expanded().has(dir));
        if (missing.length > 0) {
          this.expanded.set(new Set([...this.expanded(), ...missing]));
        }
      });
    });
  }

  /** The rev everything below the header is actually reading. */
  protected readonly effectiveRev = computed(() => {
    const state = this.tree();
    if (state.kind === 'ready') {
      return state.value.rev;
    }
    const described = this.describe();
    return this.revTail() || (described.kind === 'ready' ? (described.value.defaultBranch ?? '') : '');
  });

  protected readonly rows = computed<readonly TreeRow[]>(() => {
    const state = this.tree();
    return state.kind === 'ready'
      ? flatten(buildTree(state.value.paths), this.expanded())
      : [];
  });

  protected readonly shortSha = computed(() => {
    const state = this.tree();
    return state.kind === 'ready' ? state.value.commitSha.slice(0, 10) : '';
  });

  /** The branch list plus the current rev when it is not a branch (a sha, a tag) — so the
   *  dropdown can always show what is on screen. */
  protected readonly revOptions = computed<readonly string[]>(() => {
    const described = this.describe();
    const branches = described.kind === 'ready' ? described.value.branches : [];
    const current = this.effectiveRev();
    return current && !branches.includes(current) ? [current, ...branches] : branches;
  });

  /** Whether the tree failed because the rev does not exist — its own screen, with a way back. */
  protected readonly unknownRev = computed(() => {
    const state = this.tree();
    return state.kind === 'error' && this.treeErrorCode() === 'no-such-rev';
  });

  private readonly treeErrorSignal = signal<string | null>(null);

  protected treeErrorCode(): string | null {
    return this.treeErrorSignal();
  }

  protected readonly emptyRepository = computed(() => {
    const described = this.describe();
    return described.kind === 'ready' && described.value.branches.length === 0;
  });

  /** The repository is known to the platform but this host answered 404 for it. */
  protected readonly notOnHost = computed(() => {
    const described = this.describe();
    return described.kind === 'error' && described.status === 404;
  });

  protected async loadDescribe(repoId: string): Promise<void> {
    this.describe.set(LOADING);
    try {
      this.describe.set(ready(await this.api.describe(repoId)));
    } catch (error) {
      this.describe.set(failed(error));
    }
  }

  protected async loadTree(repoId: string, rev: string): Promise<void> {
    this.tree.set(LOADING);
    this.treeErrorSignal.set(null);
    try {
      const listing = await this.api.tree(repoId, rev || undefined);
      this.tree.set(ready(listing));
      this.expanded.set(new Set());
    } catch (error) {
      this.treeErrorSignal.set(browseErrorCode(error));
      this.tree.set(failed(error));
    }
  }

  protected retryDescribe(): void {
    const repoId = this.repoId();
    if (repoId) {
      void this.loadDescribe(repoId);
    }
  }

  protected retryTree(): void {
    const repoId = this.repoId();
    if (repoId) {
      void this.loadTree(repoId, this.revTail());
    }
  }

  /** A pick in the branch dropdown navigates: the rev is a place, so it goes in the path. */
  protected switchRev(rev: string): void {
    const { project, category, repository } = this.scoped();
    if (!project || !category || !repository) {
      return;
    }
    void this.router.navigate(['/', project, category, repository, 'branches', ...rev.split('/')]);
  }

  /** To the same rev's log — the orthogonal view of the branch. */
  protected toCommits(): void {
    const { project, category, repository } = this.scoped();
    if (!project || !category || !repository) {
      return;
    }
    const rev = this.effectiveRev();
    void this.router.navigate([
      '/',
      project,
      category,
      repository,
      'commits',
      ...(rev ? rev.split('/') : []),
    ]);
  }

  /** To the default branch — the way back from a rev that stopped existing. */
  protected toDefaultBranch(): void {
    const { project, category, repository } = this.scoped();
    if (project && category && repository) {
      void this.router.navigate(['/', project, category, repository]);
    }
  }

  protected openFile(path: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { path, lines: null },
      queryParamsHandling: 'merge',
    });
  }

  protected toggleDir(row: TreeRow): void {
    const expanded = new Set(this.expanded());
    if (row.open) {
      for (const path of row.chain) {
        expanded.delete(path);
      }
    } else {
      for (const path of row.chain) {
        expanded.add(path);
      }
    }
    this.expanded.set(expanded);
  }

  protected onRevPicked(event: Event): void {
    this.switchRev((event.target as HTMLSelectElement).value);
  }
}
