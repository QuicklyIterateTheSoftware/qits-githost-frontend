import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { QitsButton } from '@qits/ui-components';
import { GithostApi } from '../api/githost-api';
import type { RepositoryDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { cloneAddress, extraFields, type RepositoryField } from './repository-fields';

/**
 * The front door: every repository this git host serves, and the address to clone it from.
 *
 * **Load budget: `1 + 0`.** One read — `GET /githost/api/repositories` — and nothing per row.
 *
 * **A failed load is said, never drawn as an empty host.** "There are no repositories" and "I could
 * not ask" are different facts; the first is a sentence in the table, the second is an error with a
 * retry beside it and no table at all.
 *
 * **The columns beyond the id are whatever the service sent.** Only `id` is guaranteed by the
 * contract, and the record is expected to grow, so the extra fields are rendered from the answer
 * itself rather than from a list compiled in here — see {@link extraFields}. That keeps a service
 * that adds a field from needing a release of this repository to show it, and keeps a service that
 * drops one from leaving a blank column behind.
 */
@Component({
  selector: 'app-repositories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, QitsButton],
  templateUrl: './repositories-page.html',
  styleUrls: ['../ui/page.css', './repositories-page.css'],
})
export class RepositoriesPage {
  private readonly api = inject(GithostApi);

  protected readonly cloneAddress = cloneAddress;

  protected readonly repositories = signal<Loadable<readonly RepositoryDto[]>>(LOADING);

  /** The rows, once they are here; an empty list otherwise, so the template stays flat. */
  protected readonly rows = computed(() => {
    const state = this.repositories();
    return state.kind === 'ready' ? state.value : [];
  });

  /** `3 repositories.` — the host's shape in one clause, above the table. */
  protected readonly lede = computed(() => {
    const state = this.repositories();
    if (state.kind !== 'ready') {
      return '';
    }
    const count = state.value.length;
    return `${count} ${count === 1 ? 'repository' : 'repositories'}.`;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.repositories.set(LOADING);
    try {
      this.repositories.set(ready(await this.api.repositories()));
    } catch (error) {
      this.repositories.set(failed(error));
    }
  }

  /** What else the service said about this repository. Empty for a record of nothing but an id. */
  protected fieldsOf(repository: RepositoryDto): readonly RepositoryField[] {
    return extraFields(repository);
  }
}
