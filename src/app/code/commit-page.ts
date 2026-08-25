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
import { ProjectsApi } from '../api/projects-api';
import type { CommitChangesDto, CommitFileChangeDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { DiffViewer } from './diff-viewer';

/**
 * One commit — the same two-pane view as the tree, scoped to what the commit changed.
 *
 * `…/<repo>/commit/<sha>`: the touched files on the left (a flat list, because a commit's change
 * set is small and its shape IS the interesting fact), the open file's unified diff on the right.
 * The open file is `?path=`, the same grammar as everywhere else; `?branch=` remembers which log
 * the reader came from, so the way back lands on the list they left rather than the default one.
 *
 * The change set and the diffs come from qits-projects (its mirror is where the diff base
 * arithmetic lives — first parent, or the empty tree for a root commit); nothing here asks the git
 * host, because a commit view has no ref to resolve.
 */
@Component({
  selector: 'app-commit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, DiffViewer],
  templateUrl: './commit-page.html',
  styleUrls: ['../ui/page.css', './commit-page.css'],
})
export class CommitPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly projects = inject(ProjectsApi);
  private readonly scope = inject(QITS_SCOPE);
  private readonly repositorySource = inject(QITS_REPOSITORIES, { optional: true });

  private readonly url = signal(this.router.url);

  protected readonly scoped = computed(() => this.scope.scope());

  protected readonly repoId = computed(() => this.scope.repositoryId());

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

  /** The sha the address states — `…/commit/<sha>`, one segment, because a sha holds no slash. */
  protected readonly sha = computed(() => {
    const segments = this.parsedUrl().root.children['primary']?.segments ?? [];
    return segments[3]?.path === 'commit' ? (segments[4]?.path ?? '') : '';
  });

  protected readonly selectedPath = computed(() => this.parsedUrl().queryParamMap.get('path'));

  /** The log the reader came from, carried so the way back is the way they came. */
  protected readonly fromBranch = computed(() => this.parsedUrl().queryParamMap.get('branch'));

  protected readonly changes = signal<Loadable<CommitChangesDto>>(LOADING);

  private changesFor: string | null = null;

  constructor() {
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.url.set(this.router.url);
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());

    effect(() => {
      const repoId = this.repoId();
      const sha = this.sha();
      untracked(() => {
        if (!repoId || !sha) {
          return;
        }
        const key = `${repoId}@${sha}`;
        if (this.changesFor !== key) {
          this.changesFor = key;
          void this.loadChanges(repoId, sha);
        }
      });
    });
  }

  protected readonly files = computed<readonly CommitFileChangeDto[]>(() => {
    const state = this.changes();
    return state.kind === 'ready' ? state.value.files : [];
  });

  protected readonly shortSha = computed(() => this.sha().slice(0, 10));

  protected readonly lede = computed(() => {
    const state = this.changes();
    if (state.kind !== 'ready') {
      return '';
    }
    const count = state.value.files.length;
    const files = `${count} ${count === 1 ? 'file' : 'files'} changed`;
    return state.value.parent === null
      ? `${files} — a root commit, diffed against the empty tree.`
      : `${files} against ${state.value.parent.slice(0, 10)}.`;
  });

  protected async loadChanges(repoId: string, sha: string): Promise<void> {
    this.changes.set(LOADING);
    try {
      this.changes.set(ready(await this.projects.commitChanges(repoId, sha)));
    } catch (error) {
      this.changes.set(failed(error));
    }
  }

  protected retryChanges(): void {
    const repoId = this.repoId();
    const sha = this.sha();
    if (repoId && sha) {
      void this.loadChanges(repoId, sha);
    }
  }

  protected openFile(path: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { path },
      queryParamsHandling: 'merge',
    });
  }

  /** Back to the log the reader came from — `?branch=`, or the default branch's without it. */
  protected toCommits(): void {
    const { project, category, repository } = this.scoped();
    if (!project || !category || !repository) {
      return;
    }
    const branch = this.fromBranch();
    void this.router.navigate([
      '/',
      project,
      category,
      repository,
      'commits',
      ...(branch ? branch.split('/') : []),
    ]);
  }

  /** The whole tree as it stood at this commit — the tree view takes a sha as its rev. */
  protected browseTree(): void {
    const { project, category, repository } = this.scoped();
    if (!project || !category || !repository) {
      return;
    }
    void this.router.navigate(['/', project, category, repository, 'branches', this.sha()]);
  }

  /** `M` on the row; the title spells it out. */
  protected markOf(file: CommitFileChangeDto): string {
    return file.changeType.charAt(0);
  }

  protected titleOf(file: CommitFileChangeDto): string {
    const moved = file.oldPath ? ` (from ${file.oldPath})` : '';
    return `${file.changeType.toLowerCase().replace('_', ' ')}${moved}`;
  }
}
