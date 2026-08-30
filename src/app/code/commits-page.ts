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
import { NavigationEnd, Router } from '@angular/router';
import { QITS_REPOSITORIES, QITS_SCOPE } from '@qits/ui-components';
import { BrowseApi } from '../api/browse-api';
import { ProjectsApi } from '../api/projects-api';
import type { CommitDto, CommitLogDto, RepoDescribeDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { repositoryAddress } from './repository-address';

/**
 * The branch's log — the orthogonal view beside the tree at `…/<repo>/branches/<ref>`.
 *
 * ## What the list holds
 *
 * qits-projects computes the range off its mirror: on the default branch the **full history**, on
 * any other branch only the commits its parent does not have yet (`parent..branch`). The `parent`
 * field of the answer is what the lede reads — null parent means the full history came back, so
 * the page never re-derives the rule it did not make.
 *
 * ## The grammar
 *
 * `…/<repo>/commits[/<ref…>]` — the ref is the URL tail, slashes intact, exactly as the tree view
 * spells it under `branches/`; no tail is the default branch. A commit in the list navigates to
 * `…/<repo>/commit/<sha>`, the same two-pane view scoped to what that commit changed.
 *
 * ## Who answers what
 *
 * The branch list and the default branch come from the git host's describe (the same read the tree
 * view makes); the log comes from qits-projects. Two upstreams on one page, because each owns its
 * half: the host knows its refs, the projects service owns the mirror the range arithmetic runs on.
 */
@Component({
  selector: 'app-commits-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty],
  templateUrl: './commits-page.html',
  styleUrls: ['../ui/page.css', './commits-page.css'],
})
export class CommitsPage {
  private readonly router = inject(Router);
  private readonly browse = inject(BrowseApi);
  private readonly projects = inject(ProjectsApi);
  private readonly scope = inject(QITS_SCOPE);
  private readonly repositorySource = inject(QITS_REPOSITORIES, { optional: true });

  /** The address, seeded and then fed by the router — the same pattern the tree view uses. */
  private readonly url = signal(this.router.url);

  protected readonly scoped = computed(() => this.scope.scope());

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

  /** The ref the address states: every segment past `…/commits`, slashes intact. */
  protected readonly revTail = computed(() => {
    const segments = this.parsedUrl().root.children['primary']?.segments ?? [];
    if (segments[3]?.path !== 'commits') {
      return '';
    }
    return segments
      .slice(4)
      .map((segment) => segment.path)
      .join('/');
  });

  protected readonly describe = signal<Loadable<RepoDescribeDto>>(LOADING);
  protected readonly log = signal<Loadable<CommitLogDto>>(LOADING);

  private describedFor: string | null = null;
  private logFor: string | null = null;

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

    // The bare `…/commits` is a redirector, exactly as the bare tree address is: once the
    // describe names the default branch, the URL moves to `commits/<name>`. An empty repository
    // stays put — nothing to spell.
    effect(() => {
      const described = this.describe();
      const rev = this.revTail();
      untracked(() => {
        if (rev !== '' || described.kind !== 'ready' || described.value.branches.length === 0) {
          return;
        }
        const branch = described.value.defaultBranch;
        const { project, group, repository } = repositoryAddress(this.scoped());
        if (!branch || !project || !group || !repository) {
          return;
        }
        void this.router.navigate(
          ['/', project, group, repository, 'commits', ...branch.split('/')],
          { replaceUrl: true, queryParamsHandling: 'preserve' },
        );
      });
    });

    // The log waits for a SPELLED branch — the bare form redirects rather than loading, so no
    // request is ever spent on an address about to be replaced.
    effect(() => {
      const repoId = this.repoId();
      const rev = this.revTail();
      untracked(() => {
        if (!repoId || rev === '') {
          return;
        }
        const key = `${repoId}@${rev}`;
        if (this.logFor !== key) {
          this.logFor = key;
          void this.loadLog(repoId, rev);
        }
      });
    });
  }

  /** The branch the list is actually about. */
  protected readonly effectiveRev = computed(() => {
    const state = this.log();
    if (state.kind === 'ready') {
      return state.value.branch;
    }
    const described = this.describe();
    return this.revTail() || (described.kind === 'ready' ? (described.value.defaultBranch ?? '') : '');
  });

  protected readonly revOptions = computed<readonly string[]>(() => {
    const described = this.describe();
    const branches = described.kind === 'ready' ? described.value.branches : [];
    const current = this.effectiveRev();
    return current && !branches.includes(current) ? [current, ...branches] : branches;
  });

  protected readonly commits = computed<readonly CommitDto[]>(() => {
    const state = this.log();
    return state.kind === 'ready' ? state.value.commits : [];
  });

  /** What the list IS — said off the answer's own `parent`, never re-derived here. */
  protected readonly lede = computed(() => {
    const state = this.log();
    if (state.kind !== 'ready') {
      return '';
    }
    const count = state.value.commits.length;
    const commits = `${count} ${count === 1 ? 'commit' : 'commits'}`;
    return state.value.parent === null
      ? `The full history of ${state.value.branch} — ${commits}.`
      : `${commits} on ${state.value.branch} not yet merged to ${state.value.parent}.`;
  });

  protected readonly emptyRepository = computed(() => {
    const described = this.describe();
    return described.kind === 'ready' && described.value.branches.length === 0;
  });

  protected readonly notOnHost = computed(() => {
    const described = this.describe();
    return described.kind === 'error' && described.status === 404;
  });

  protected async loadDescribe(repoId: string): Promise<void> {
    this.describe.set(LOADING);
    try {
      this.describe.set(ready(await this.browse.describe(repoId)));
    } catch (error) {
      this.describe.set(failed(error));
    }
  }

  protected async loadLog(repoId: string, branch: string): Promise<void> {
    this.log.set(LOADING);
    try {
      this.log.set(ready(await this.projects.commits(repoId, branch)));
    } catch (error) {
      this.log.set(failed(error));
    }
  }

  protected retryLog(): void {
    const repoId = this.repoId();
    const branch = this.effectiveRev();
    if (repoId && branch) {
      void this.loadLog(repoId, branch);
    }
  }

  protected retryDescribe(): void {
    const repoId = this.repoId();
    if (repoId) {
      void this.loadDescribe(repoId);
    }
  }

  protected switchRev(rev: string): void {
    const { project, group, repository } = repositoryAddress(this.scoped());
    if (!project || !group || !repository) {
      return;
    }
    void this.router.navigate(['/', project, group, repository, 'commits', ...rev.split('/')]);
  }

  /** Back to the same rev's tree — the other half of the pair. */
  protected toFiles(): void {
    const { project, group, repository } = repositoryAddress(this.scoped());
    if (!project || !group || !repository) {
      return;
    }
    const rev = this.effectiveRev();
    void this.router.navigate([
      '/',
      project,
      group,
      repository,
      'branches',
      ...(rev ? rev.split('/') : []),
    ]);
  }

  protected openCommit(commit: CommitDto): void {
    const { project, group, repository } = repositoryAddress(this.scoped());
    if (!project || !group || !repository) {
      return;
    }
    void this.router.navigate(['/', project, group, repository, 'commit', commit.hash], {
      queryParams: { branch: this.effectiveRev() || null },
    });
  }

  protected onRevPicked(event: Event): void {
    this.switchRev((event.target as HTMLSelectElement).value);
  }

  /** `2026-08-25 14:12` out of git's strict ISO date — enough to place a commit, no timezone math. */
  protected dateOf(commit: CommitDto): string {
    return commit.date.length >= 16 ? commit.date.slice(0, 16).replace('T', ' ') : commit.date;
  }
}
