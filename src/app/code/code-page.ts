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
import type { LocSummaryDto, RepoDescribeDto, RepoTagsDto, TreeListingDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { FileTree } from './file-tree';
import { FileViewer } from './file-viewer';
import { LocPanel } from './loc-panel';
import { parseRange } from './line-range';
import { repositoryAddress } from './repository-address';
import { ancestorDirs, buildTree, flatten, type TreeRow } from './tree-model';

/** Which kind of ref the address names; `default` is the bare form, which redirects to a branch. */
type RevKind = 'branch' | 'tag' | 'default';

/** How a tag is asked for: the one spelling the service cannot resolve to anything else. */
const TAG_PREFIX = 'refs/tags/';

/** One entry in the rev dropdown: what the reader reads, and where a pick goes. */
interface RevOption {
  readonly label: string;
  /** The URL form — `branches/<name>` or `tags/<name>` — so a pick needs no second lookup. */
  readonly value: string;
}

/** A branch reads as its bare name and is addressed under `branches/`. */
function branchOption(branch: string): RevOption {
  return { label: branch, value: `branches/${branch}` };
}

/** A tag likewise, under `tags/` — the kind is what keeps the two apart when they share a name. */
function tagOption(tag: string): RevOption {
  return { label: tag, value: `tags/${tag}` };
}

/**
 * The Code page: one repository's committed contents, read from the bare storage — the page the
 * platform's per-repository `Code` navigation entries land on.
 *
 * ## The address is the state
 *
 * `/<slug>/<group>/<repo>/<branches|tags>/<ref…>?path=…&lines=…`. The rev is the URL tail — every
 * segment past the kind, so a `feature/x` branch keeps its slash — and no tail at all means the
 * default branch, which the service resolves so this page never has to know it before asking. The
 * open file and the painted range are query parameters, read from the URL and never off a click,
 * so a click, a paste, a reload and the back button are one code path — the grammar the workspaces
 * file browser settled and this page repeats.
 *
 * **The kind is spelled because a tag may share a name with a branch.** A bare `2026.903.113443`
 * would be whatever git resolved first; `tags/2026.903.113443` asks for `refs/tags/…` and can only
 * be the tag. Branches keep their bare spelling — that ambiguity was never theirs to create, and
 * respelling them would break every link already written.
 *
 * ## What a load costs
 *
 * `1 + 1 + 1 + 1 + 1`: the describe (branches and default branch), the tag list, the whole tree at
 * the rev in one eager read, the rev's lines-of-code summary (memoized server-side per commit), and
 * one read per opened file. Directories cost nothing — they are derived from the paths.
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
  imports: [Async, Empty, FileTree, FileViewer, LocPanel],
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
   * The ref the address states, and which kind of ref it is: every segment past
   * `…/<repo>/<branches|tags>`, slashes intact. The bare repository address spells neither kind and
   * means the default branch — that spelling is what the platform's `Code` navigation entries link
   * to, and the redirect below turns it into the branch form.
   */
  protected readonly revRef = computed<{ kind: RevKind; name: string }>(() => {
    const segments = this.parsedUrl().root.children['primary']?.segments ?? [];
    const head = segments[3]?.path;
    if (head !== 'branches' && head !== 'tags') {
      return { kind: 'default', name: '' };
    }
    return {
      kind: head === 'tags' ? 'tag' : 'branch',
      name: segments
        .slice(4)
        .map((segment) => segment.path)
        .join('/'),
    };
  });

  /** The ref's own name, unqualified — what the reader sees and what a load keys on. */
  protected readonly revTail = computed(() => this.revRef().name);

  /**
   * What the tree and the loc reads actually ASK for. A tag is spelled as its full ref, so a tag
   * that shares a name with a branch resolves to the tag and not to whatever git found first; a
   * branch keeps its bare name, which is what the service has always been asked for.
   */
  private readonly requestedRev = computed(() => {
    const { kind, name } = this.revRef();
    if (name === '') {
      return '';
    }
    return kind === 'tag' ? `${TAG_PREFIX}${name}` : name;
  });

  protected readonly selectedPath = computed(
    () => this.parsedUrl().queryParamMap.get('path'),
  );

  protected readonly anchor = computed(() =>
    parseRange(this.parsedUrl().queryParamMap.get('lines')),
  );

  protected readonly describe = signal<Loadable<RepoDescribeDto>>(LOADING);
  protected readonly tags = signal<Loadable<RepoTagsDto>>(LOADING);
  protected readonly tree = signal<Loadable<TreeListingDto>>(LOADING);
  protected readonly loc = signal<Loadable<LocSummaryDto>>(LOADING);

  /** Directory paths the user has opened. Reset when a different tree arrives. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  private describedFor: string | null = null;
  private taggedFor: string | null = null;
  private treeFor: string | null = null;
  private locFor: string | null = null;

  constructor() {
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.url.set(this.router.url);
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());

    // The tags ride beside the describe: same trigger, their own request, and a failure of theirs
    // is not a failure of the page — the dropdown then offers branches alone, the way it did before
    // there were tags in it.
    effect(() => {
      const repoId = this.repoId();
      untracked(() => {
        if (!repoId) {
          return;
        }
        if (this.describedFor !== repoId) {
          this.describedFor = repoId;
          void this.loadDescribe(repoId);
        }
        if (this.taggedFor !== repoId) {
          this.taggedFor = repoId;
          void this.loadTags(repoId);
        }
      });
    });

    // The bare address is a redirector, not a place: once the describe says what the default
    // branch is called, the URL moves to `branches/<name>` so the address spells what is on
    // screen. `replaceUrl` keeps the back button from bouncing through the bare form, and the
    // query is preserved so a `?path=…&lines=…` deep link survives the hop. An empty repository
    // stays put — its branch is unborn, and spelling it would put a name on nothing.
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
          ['/', project, group, repository, 'branches', ...branch.split('/')],
          { replaceUrl: true, queryParamsHandling: 'preserve' },
        );
      });
    });

    // The tree read waits for a SPELLED rev: the bare forms redirect (above), an empty repository
    // is said through its empty branch list, and asking for an unspelled tree would only race the
    // redirect into a duplicate request.
    effect(() => {
      const repoId = this.repoId();
      const described = this.describe();
      const rev = this.requestedRev();
      untracked(() => {
        if (!repoId || described.kind !== 'ready' || rev === '') {
          return;
        }
        const key = `${repoId}@${rev}`;
        if (this.treeFor !== key) {
          this.treeFor = key;
          void this.loadTree(repoId, rev);
        }
      });
    });

    // The loc summary rides beside the tree — same gate, same key, its own request — so a slow
    // count never holds the tree and a failed one degrades to one quiet line under it.
    effect(() => {
      const repoId = this.repoId();
      const described = this.describe();
      const rev = this.requestedRev();
      untracked(() => {
        if (!repoId || described.kind !== 'ready' || rev === '') {
          return;
        }
        const key = `${repoId}@${rev}`;
        if (this.locFor !== key) {
          this.locFor = key;
          void this.loadLoc(repoId, rev);
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

  /**
   * The rev everything below the header is actually reading, spelled the way a reader spells it:
   * the tree echoes back what was asked for, which for a tag is the full `refs/tags/…` ref, and
   * nothing on screen — the header line, the commits jump, the dropdown's selection — wants that
   * prefix.
   */
  protected readonly effectiveRev = computed(() => {
    const state = this.tree();
    if (state.kind === 'ready') {
      const rev = state.value.rev;
      return rev.startsWith(TAG_PREFIX) ? rev.slice(TAG_PREFIX.length) : rev;
    }
    const described = this.describe();
    return this.revTail() || (described.kind === 'ready' ? (described.value.defaultBranch ?? '') : '');
  });

  /** The languages to draw, or null — one check for "ready and not empty", template-narrowable. */
  protected readonly locLanguages = computed(() => {
    const state = this.loc();
    return state.kind === 'ready' && state.value.languages.length > 0
      ? state.value.languages
      : null;
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

  /**
   * The branch half of the dropdown, plus the current rev when it is neither a branch nor a tag —
   * a raw sha, or a branch deleted since the page was linked — so the dropdown can always show what
   * is on screen. The prepended one is spelled as a branch because that is what the address it came
   * from spells, and picking it again must land back where the reader already is.
   */
  protected readonly branchOptions = computed<readonly RevOption[]>(() => {
    const described = this.describe();
    const branches = described.kind === 'ready' ? described.value.branches : [];
    const options = branches.map((branch) => branchOption(branch));
    const current = this.effectiveRev();
    if (!current || branches.includes(current) || this.revRef().kind === 'tag') {
      return options;
    }
    return [branchOption(current), ...options];
  });

  /**
   * The tag half, in the order the service served: newest first, which is the useful order. The
   * tag in the address joins it when the list does not hold it — a tag deleted since the link was
   * written, or a list that never arrived — for the same reason a stray branch does above.
   */
  protected readonly tagOptions = computed<readonly RevOption[]>(() => {
    const state = this.tags();
    const options = state.kind === 'ready' ? state.value.tags.map((tag) => tagOption(tag.name)) : [];
    const { kind, name } = this.revRef();
    if (kind !== 'tag' || !name || options.some((option) => option.label === name)) {
      return options;
    }
    return [tagOption(name), ...options];
  });

  /** Nothing to pick, nothing to draw — an empty repository has neither branch nor tag. */
  protected readonly hasRevOptions = computed(
    () => this.branchOptions().length > 0 || this.tagOptions().length > 0,
  );

  /** Which option is the one on screen, in the same URL form the options carry. */
  protected readonly pickedOption = computed(() => {
    const rev = this.effectiveRev();
    if (!rev) {
      return '';
    }
    return this.revRef().kind === 'tag' ? `tags/${rev}` : `branches/${rev}`;
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

  /**
   * Fail-soft, like the loc summary: a dropdown offering branches alone is a far smaller loss than
   * a page that refuses to draw because the tag list did not arrive.
   */
  protected async loadTags(repoId: string): Promise<void> {
    this.tags.set(LOADING);
    try {
      this.tags.set(ready(await this.api.tags(repoId)));
    } catch (error) {
      this.tags.set(failed(error));
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

  protected async loadLoc(repoId: string, rev: string): Promise<void> {
    this.loc.set(LOADING);
    try {
      this.loc.set(ready(await this.api.loc(repoId, rev || undefined)));
    } catch (error) {
      this.loc.set(failed(error));
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
      void this.loadTree(repoId, this.requestedRev());
    }
  }

  /**
   * A pick in the rev dropdown navigates: the rev is a place, so it goes in the path. The option's
   * value is already that path's tail — `branches/<name>` or `tags/<name>` — so the kind travels
   * with the pick and nothing here has to guess it back.
   */
  protected switchRev(option: string): void {
    const { project, group, repository } = repositoryAddress(this.scoped());
    if (!project || !group || !repository) {
      return;
    }
    void this.router.navigate(['/', project, group, repository, ...option.split('/')]);
  }

  /** To the same rev's log — the orthogonal view of the branch. */
  protected toCommits(): void {
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
      'commits',
      ...(rev ? rev.split('/') : []),
    ]);
  }

  /** To the default branch — the way back from a rev that stopped existing. */
  protected toDefaultBranch(): void {
    const { project, group, repository } = repositoryAddress(this.scoped());
    if (project && group && repository) {
      void this.router.navigate(['/', project, group, repository]);
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
