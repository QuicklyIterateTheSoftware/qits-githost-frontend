import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { LanguageLocDto } from '../api/dto';

/**
 * The repository's line counts, per language, test split from main — the ambient stat block under
 * the file tree. Presentation only, the `FileTree` stance: it holds no state and makes no request;
 * the page owns the load and decides whether this renders at all.
 *
 * The order is the service's — largest total first — and the columns are test-then-main, which is
 * the order the feature was asked for.
 */
@Component({
  selector: 'app-loc-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <section class="loc" aria-label="Lines of code">
      @for (lang of languages(); track lang.language) {
        <h3 class="lang">{{ lang.language }}</h3>
        <dl class="split">
          <div>
            <dt>test</dt>
            <dd>{{ lang.testLines | number }} loc</dd>
          </div>
          <div>
            <dt>main</dt>
            <dd>{{ lang.mainLines | number }} loc</dd>
          </div>
        </dl>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .loc {
      padding: 0.5rem 0.75rem 0.65rem;
      border: 1px solid #e5e7eb;
      border-radius: 0.35rem;
      background: #ffffff;
    }
    .lang {
      margin: 0.55rem 0 0.15rem;
      color: #6b7280;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .lang:first-child {
      margin-top: 0;
    }
    .split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 0.75rem;
      margin: 0;
    }
    .split dt {
      color: #9ca3af;
      font-size: 0.75rem;
    }
    .split dd {
      margin: 0.05rem 0 0;
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class LocPanel {
  readonly languages = input.required<readonly LanguageLocDto[]>();
}
