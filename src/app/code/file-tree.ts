import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { TreeRow } from './tree-model';

/**
 * The rows of the committed tree, and nothing else — it holds no state and makes no request.
 *
 * Copied from qits-spa-workspaces' `detail/files/file-tree.ts`, minus what a bare repository does
 * not have: lazy stubs, child counts, in-flight markers and the ignored dimming. Everything it
 * draws was decided in `tree-model.ts` and everything it does is an output — that split is what
 * lets the model be tested as arithmetic rather than through a DOM.
 *
 * **The chevron is drawn in CSS**: a rotated bordered corner costs the same as a `▸` character and
 * cannot fail to render where the font has no glyph.
 *
 * **A folder click never moves the selection.** Toggling a directory while reading a file is
 * navigation, not a choice of file, and stealing the highlight would lose the user's place.
 *
 * **The flattened list is deliberate.** A recursive component would nest one host element per
 * level and make `aria-level` a lie about the DOM; a flat list with `aria-level` is the pattern
 * assistive technology expects.
 */
@Component({
  selector: 'app-file-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="tree" role="tree" [attr.aria-label]="label()">
      @for (row of rows(); track row.node.path) {
        <li
          class="row"
          role="treeitem"
          [class.selected]="row.node.path === selected()"
          [attr.aria-level]="row.depth + 1"
          [attr.aria-expanded]="row.node.kind === 'file' ? null : row.open"
          [attr.aria-selected]="row.node.path === selected()"
          [style.padding-left.rem]="0.35 + row.depth * 0.85"
        >
          <button
            type="button"
            class="entry"
            [class.file]="row.node.kind === 'file'"
            [attr.data-path]="row.node.path"
            [attr.data-kind]="row.node.kind"
            [attr.title]="row.node.path"
            (click)="press(row)"
          >
            @if (row.node.kind === 'file') {
              <span class="gap" aria-hidden="true"></span>
            } @else {
              <span class="chevron" [class.open]="row.open" aria-hidden="true"></span>
            }
            @if (row.prefix.length > 0) {
              <span class="prefix">
                @for (segment of row.prefix; track $index) {
                  <span class="segment">{{ segment }}</span>
                  <span class="slash" aria-hidden="true">/</span>
                }
              </span>
            }
            <span class="name">{{ row.node.name }}</span>
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .tree {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: block;
    }
    .entry {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      width: 100%;
      padding: 0.15rem 0.35rem;
      border: 0;
      border-radius: 0.25rem;
      background: none;
      color: #111827;
      font: inherit;
      font-size: 0.85rem;
      text-align: left;
      cursor: pointer;
    }
    .entry:hover {
      background: #f3f4f6;
    }
    .row.selected > .entry {
      background: #eff6ff;
      color: #1d4ed8;
      font-weight: 600;
    }
    /* A rotated bordered corner rather than a ▸ character: no font can fail to render a border. */
    .chevron,
    .gap {
      flex: 0 0 auto;
      width: 0.7rem;
      height: 0.7rem;
    }
    .chevron::before {
      content: '';
      display: block;
      width: 0.34rem;
      height: 0.34rem;
      margin: 0.16rem 0 0 0.1rem;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: rotate(-45deg);
      transition: transform 120ms ease;
    }
    .chevron.open::before {
      transform: rotate(45deg);
    }
    @media (prefers-reduced-motion: reduce) {
      .chevron::before {
        transition: none;
      }
    }
    .prefix {
      color: #9ca3af;
      font-size: 0.78rem;
    }
    .slash {
      margin: 0 0.15rem;
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class FileTree {
  /** The rows to draw, already compacted and ordered by the model. */
  readonly rows = input.required<readonly TreeRow[]>();

  /** The open file's path, which is the only row drawn as chosen. */
  readonly selected = input<string | null>(null);

  /** What the tree is called, for a screen reader. */
  readonly label = input('Repository tree');

  /** A file was chosen. */
  readonly openFile = output<string>();

  /** A directory row was pressed. The page updates its expansion set. */
  readonly toggleDir = output<TreeRow>();

  protected press(row: TreeRow): void {
    if (row.node.kind === 'file') {
      this.openFile.emit(row.node.path);
    } else {
      this.toggleDir.emit(row);
    }
  }
}
