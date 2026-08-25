import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { BrowseApi } from '../api/browse-api';
import type { FileContentDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import type { LineRange } from './line-range';

/** The service's content cap: past it the answer is `binary: true` with the real size beside it. */
export const FILE_CONTENT_CAP_BYTES = 2 * 1024 * 1024;

/** One drawn line. The number is what the gutter prints and what a range is expressed in. */
interface ViewerLine {
  readonly number: number;
  readonly text: string;
}

/**
 * The read-only file viewer: line numbers and a painted `?lines=` highlight.
 *
 * Copied from qits-spa-workspaces' `detail/files/file-viewer.ts` and trimmed to a bare-repository
 * reader: no live-refresh hints (a commit is immutable — the bytes at one rev cannot go stale
 * under the reader), no line picking, and no tab-visibility gate (this page has no tabs). Opening
 * a file costs exactly one request — `GET …/file?rev=…&path=…`.
 *
 * Unlike the workspaces viewer, **the size is always known**: the service answers `size` beside
 * `binary`, so the too-large and genuinely-binary cases get their own honest sentences instead of
 * the "one flag, two meanings" hedge that viewer documents.
 *
 * Syntax highlighting, rendered markdown and row virtualisation remain the named fast-follows they
 * are over there, for the same reasons.
 */
@Component({
  selector: 'app-file-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty],
  template: `
    @if (!path()) {
      <app-empty message="Select a file to view its contents." />
    } @else {
      <app-async
        [state]="file()"
        [loadingLabel]="'Loading ' + path()"
        [errorLabel]="'Failed to load ' + path()"
        (retry)="reload()"
      />

      @if (file(); as state) {
        @if (state.kind === 'ready') {
          @if (state.value.binary) {
            <p class="unrenderable" role="status">{{ unrenderable() }}</p>
          } @else if (lines().length === 0) {
            <p class="unrenderable" role="status">This file is empty.</p>
          } @else {
            <div class="code">
              <ol class="lines">
                @for (line of lines(); track line.number) {
                  <li
                    class="line"
                    [class.anchored]="isAnchored(line.number)"
                    [attr.data-line]="line.number"
                  >
                    <span class="num" aria-hidden="true">{{ line.number }}</span>
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
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      padding: 0 0.5rem;
    }
    .line.anchored {
      background: #fef3c7;
    }
    .num {
      flex: 0 0 3rem;
      color: #9ca3af;
      text-align: right;
      user-select: none;
    }
    .text {
      flex: 1 1 auto;
      color: #111827;
      white-space: pre;
      tab-size: 2;
    }
  `,
})
export class FileViewer {
  private readonly api = inject(BrowseApi);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** The storage id the browse endpoints key by. */
  readonly repoId = input.required<string>();

  /** The rev to read at; undefined asks the service for the default branch. */
  readonly rev = input<string | undefined>(undefined);

  /** The open file, or null for the empty state. */
  readonly path = input<string | null>(null);

  /** The deep link's range: painted and scrolled to. */
  readonly anchor = input<LineRange | null>(null);

  protected readonly file = signal<Loadable<FileContentDto>>(LOADING);

  constructor() {
    effect(() => {
      const repoId = this.repoId();
      const rev = this.rev();
      const path = this.path();
      untracked(() => {
        if (path) {
          void this.load(repoId, rev, path);
        }
      });
    });

    // Scroll to the anchor once the content that has the line in it is on screen. It runs on the
    // content rather than on the anchor because an anchor that arrives before the file has nothing
    // to scroll to, and both orders happen.
    effect(() => {
      const state = this.file();
      const anchor = this.anchor();
      if (state.kind === 'ready' && anchor) {
        untracked(() => queueMicrotask(() => this.scrollTo(anchor.startLine)));
      }
    });
  }

  /**
   * The lines to draw. A single trailing empty entry is dropped: a file that ends with a newline
   * splits into one more piece than it has lines, and a phantom final row would put a line number
   * on nothing.
   */
  protected readonly lines = computed<readonly ViewerLine[]>(() => {
    const state = this.file();
    if (state.kind !== 'ready' || state.value.binary || state.value.content === undefined) {
      return [];
    }
    if (state.value.content === '') {
      return [];
    }
    const pieces = state.value.content.split('\n');
    if (pieces.length > 1 && pieces[pieces.length - 1] === '') {
      pieces.pop();
    }
    return pieces.map((text, at) => ({ number: at + 1, text }));
  });

  /** Which of the two things `binary: true` means — the size, always present here, says. */
  protected readonly unrenderable = computed(() => {
    const state = this.file();
    if (state.kind !== 'ready') {
      return '';
    }
    const bytes = state.value.size;
    return bytes > FILE_CONTENT_CAP_BYTES
      ? `This file is ${(bytes / 1024 / 1024).toFixed(1)} MB, over the 2 MB read limit, so it was not sent.`
      : 'This file is binary, so there is nothing to show.';
  });

  protected isAnchored(line: number): boolean {
    const anchor = this.anchor();
    return anchor !== null && line >= anchor.startLine && line <= anchor.endLine;
  }

  protected reload(): void {
    const path = this.path();
    if (path) {
      void this.load(this.repoId(), this.rev(), path);
    }
  }

  private async load(repoId: string, rev: string | undefined, path: string): Promise<void> {
    this.file.set(LOADING);
    try {
      const content = await this.api.file(repoId, rev, path);
      // A late answer for a file nobody is reading any more is dropped rather than drawn: two
      // opens in quick succession must not leave the first one's bytes under the second's name.
      if (this.path() === path) {
        this.file.set(ready(content));
      }
    } catch (error) {
      if (this.path() === path) {
        this.file.set(failed(error));
      }
    }
  }

  private scrollTo(line: number): void {
    const element = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `.line[data-line="${line}"]`,
    );
    // Guarded because jsdom has no layout and does not implement it.
    element?.scrollIntoView?.({ block: 'center' });
  }
}
