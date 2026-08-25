import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ProjectsApi } from '../api/projects-api';
import type { CommitFileDiffDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';

/** One drawn diff line, classed by its first character — the whole of unified-diff rendering. */
interface DiffLine {
  readonly kind: 'add' | 'del' | 'hunk' | 'meta' | 'context';
  readonly text: string;
}

/**
 * A single file's unified diff, coloured by line — the commit view's right pane, where the tree
 * view puts its file viewer.
 *
 * The patch text is git's own (`CommitFileDiffDto.diff`) and is rendered as lines, not parsed:
 * `+`/`-` colour, `@@` marks a hunk, and the `diff/index/---/+++` preamble dims. That is the whole
 * of what a reader needs to see a change, and everything smarter — side-by-side, intra-line
 * highlights — is a fast-follow on the same pane, exactly as syntax highlighting is on the file
 * viewer.
 *
 * An EMPTY patch is an answer, not an absence: git emits none for a binary change or a pure
 * rename, and the sentence below says so rather than showing a blank pane.
 */
@Component({
  selector: 'app-diff-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty],
  template: `
    @if (!path()) {
      <app-empty message="Select a changed file to view its diff." />
    } @else {
      <app-async
        [state]="file()"
        [loadingLabel]="'Loading the diff of ' + path()"
        [errorLabel]="'Failed to load the diff of ' + path()"
        (retry)="reload()"
      />

      @if (file(); as state) {
        @if (state.kind === 'ready') {
          @if (lines().length === 0) {
            <p class="unrenderable" role="status">
              No textual change to show — a binary file, or a pure rename.
            </p>
          } @else {
            <div class="code">
              <ol class="lines">
                @for (line of lines(); track $index) {
                  <li class="line" [class]="line.kind">
                    <code class="text">{{ line.text }}</code>
                  </li>
                }
              </ol>
            </div>
          }
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .unrenderable {
      margin: 0.5rem 0;
      color: #6b7280;
      font-size: 0.85rem;
    }
    .code {
      overflow: auto;
      max-height: 34rem;
      border: 1px solid #e5e7eb;
      border-radius: 0.35rem;
      background: #ffffff;
    }
    .lines {
      margin: 0;
      padding: 0.35rem 0;
      list-style: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      line-height: 1.5;
    }
    .line {
      padding: 0 0.5rem;
    }
    .text {
      color: #111827;
      white-space: pre;
      tab-size: 2;
    }
    .line.add {
      background: #ecfdf5;
    }
    .line.add .text {
      color: #065f46;
    }
    .line.del {
      background: #fef2f2;
    }
    .line.del .text {
      color: #991b1b;
    }
    .line.hunk {
      background: #eff6ff;
    }
    .line.hunk .text {
      color: #1d4ed8;
    }
    .line.meta .text {
      color: #9ca3af;
    }
  `,
})
export class DiffViewer {
  private readonly api = inject(ProjectsApi);

  readonly repoId = input.required<string>();
  readonly sha = input.required<string>();

  /** The changed file to show, or null for the empty state. */
  readonly path = input<string | null>(null);

  protected readonly file = signal<Loadable<CommitFileDiffDto>>(LOADING);

  constructor() {
    effect(() => {
      const repoId = this.repoId();
      const sha = this.sha();
      const path = this.path();
      untracked(() => {
        if (path) {
          void this.load(repoId, sha, path);
        }
      });
    });
  }

  protected readonly lines = computed<readonly DiffLine[]>(() => {
    const state = this.file();
    if (state.kind !== 'ready' || !state.value.diff) {
      return [];
    }
    const pieces = state.value.diff.split('\n');
    if (pieces.length > 1 && pieces[pieces.length - 1] === '') {
      pieces.pop();
    }
    return pieces.map((text) => ({ kind: kindOf(text), text }));
  });

  protected reload(): void {
    const path = this.path();
    if (path) {
      void this.load(this.repoId(), this.sha(), path);
    }
  }

  private async load(repoId: string, sha: string, path: string): Promise<void> {
    this.file.set(LOADING);
    try {
      const diff = await this.api.commitFileDiff(repoId, sha, path);
      // A late answer for a file nobody is reading any more is dropped rather than drawn.
      if (this.path() === path) {
        this.file.set(ready(diff));
      }
    } catch (error) {
      if (this.path() === path) {
        this.file.set(failed(error));
      }
    }
  }
}

/**
 * A line's class, off its first characters. `+++`/`---` are file headers and dim with the
 * preamble; a bare `+`/`-` is the change itself.
 */
function kindOf(text: string): DiffLine['kind'] {
  if (text.startsWith('@@')) {
    return 'hunk';
  }
  if (text.startsWith('+++') || text.startsWith('---')) {
    return 'meta';
  }
  if (text.startsWith('+')) {
    return 'add';
  }
  if (text.startsWith('-')) {
    return 'del';
  }
  if (text.startsWith('diff ') || text.startsWith('index ') || text.startsWith('new ')
      || text.startsWith('old ') || text.startsWith('rename ') || text.startsWith('copy ')
      || text.startsWith('similarity ') || text.startsWith('deleted ') || text.startsWith('Binary ')) {
    return 'meta';
  }
  return 'context';
}
