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
import {
  QITS_REPOSITORIES,
  QITS_SCOPE,
  QitsChangeTree,
  QitsDiffViewer,
  type QitsChangeEntry,
} from '@qits/ui-components';
import { ProjectsApi } from '../api/projects-api';
import type { CommitChangesDto, CommitFileDiffDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { repositoryAddress } from './repository-address';

/**
 * One commit — the same two-pane view as the tree, scoped to what the commit changed.
 *
 * `…/<repo>/commit/<sha>`: the touched files on the left, the open file's unified diff on the
 * right. The open file is `?path=`, the same grammar as everywhere else; `?branch=` remembers which
 * log the reader came from, so the way back lands on the list they left rather than the default one.
 *
 * The change set and the diffs come from qits-projects (its mirror is where the diff base
 * arithmetic lives — first parent, or the empty tree for a root commit); nothing here asks the git
 * host, because a commit view has no ref to resolve.
 *
 * **The left pane is a folding tree, not a flat list.** The shape of a change set is still the
 * interesting fact — it is the first thing a reader wants from a commit — and the tree states that
 * shape directly where a flat list only implied it. A commit that touches three directories and
 * nothing else reads as three folded rows each naming its whole address, instead of N strings that
 * repeat the same prefix and leave the reader to spot the grouping by eye. Folding a single-child
 * chain into one row is what makes that true of this platform's paths in particular.
 *
 * **Both panes are `@qits/ui-components`' `QitsChangeTree` and `QitsDiffViewer`, shared with the
 * release request's changes tab.** A commit and a fold are the same question asked of different
 * endpoints, so the drawing is one implementation and the reading is two.
 *
 * **That sharing is why this page owns the per-file patch read.** The diff pane used to fetch its
 * own patch from `…/commits/{sha}/diff`; a self-fetching child cannot serve a second caller whose
 * patch comes from somewhere else, so the read moved up here and the component takes the text as an
 * input. The stale-answer guard came with it: an answer for a file nobody is reading any more is
 * dropped rather than drawn.
 *
 * **Add, delete and rename are now distinguishable.** The old flat list drew every mark the same
 * grey letter; the tree tones the mark by change type and a renamed row's title names the path it
 * came from, which is the one thing a rename's empty patch cannot say for itself.
 */
@Component({
  selector: 'app-commit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, QitsChangeTree, QitsDiffViewer],
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

  /** The open file's patch. Its own read, because the diff pane no longer makes one. */
  protected readonly diff = signal<Loadable<CommitFileDiffDto>>(LOADING);

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

    // The open file's patch, read here rather than in the pane that draws it — see the class note.
    effect(() => {
      const repoId = this.repoId();
      const sha = this.sha();
      const path = this.selectedPath();
      untracked(() => {
        if (repoId && sha && path) {
          void this.loadDiff(repoId, sha, path);
        }
      });
    });
  }

  /**
   * The change set as the tree takes it. The wire's `oldPath` is the tree's `previousPath`: the
   * same fact under the name the shared model chose, which is adaptation, not translation.
   */
  protected readonly entries = computed<readonly QitsChangeEntry[]>(() => {
    const state = this.changes();
    return state.kind === 'ready'
      ? state.value.files.map((file) => ({
          path: file.path,
          previousPath: file.oldPath,
          changeType: file.changeType,
        }))
      : [];
  });

  /** The patch text, or nothing at all while the read is in flight or after it refused. */
  protected readonly patch = computed(() => {
    const state = this.diff();
    return state.kind === 'ready' ? state.value.diff : '';
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

  private async loadDiff(repoId: string, sha: string, path: string): Promise<void> {
    this.diff.set(LOADING);
    try {
      const diff = await this.projects.commitFileDiff(repoId, sha, path);
      // A late answer for a file nobody is reading any more is dropped rather than drawn.
      if (this.selectedPath() === path) {
        this.diff.set(ready(diff));
      }
    } catch (error) {
      if (this.selectedPath() === path) {
        this.diff.set(failed(error));
      }
    }
  }

  protected retryDiff(): void {
    const repoId = this.repoId();
    const sha = this.sha();
    const path = this.selectedPath();
    if (repoId && sha && path) {
      void this.loadDiff(repoId, sha, path);
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
    const { project, group, repository } = repositoryAddress(this.scoped());
    if (!project || !group || !repository) {
      return;
    }
    const branch = this.fromBranch();
    void this.router.navigate([
      '/',
      project,
      group,
      repository,
      'commits',
      ...(branch ? branch.split('/') : []),
    ]);
  }

  /** The whole tree as it stood at this commit — the tree view takes a sha as its rev. */
  protected browseTree(): void {
    const { project, group, repository } = repositoryAddress(this.scoped());
    if (!project || !group || !repository) {
      return;
    }
    void this.router.navigate(['/', project, group, repository, 'branches', this.sha()]);
  }
}
