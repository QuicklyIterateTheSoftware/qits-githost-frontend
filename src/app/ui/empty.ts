import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Something that loaded and holds nothing, said in a sentence.
 *
 * It exists so an empty answer is never drawn as blank space — a table that renders nothing is
 * indistinguishable from one that failed silently.
 */
@Component({
  selector: 'app-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="empty">{{ message() }}</p>`,
  styles: `
    .empty {
      margin: 0.15rem 0;
      color: #6b7280;
      font-style: italic;
    }
  `,
})
export class Empty {
  readonly message = input.required<string>();
}
