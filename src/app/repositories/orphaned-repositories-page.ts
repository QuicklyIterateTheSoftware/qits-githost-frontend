import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { QitsButton } from '@qits/ui-components';
import { GithostApi } from '../api/githost-api';
import { ProjectsApi } from '../api/projects-api';
import type { RepositoryDto } from '../api/dto';
import { Async } from '../ui/async';
import { Empty } from '../ui/empty';
import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
import { extraFields, type RepositoryField } from './repository-fields';

/** The two answers the join needs, held together so the page is ready exactly once. */
interface Audit {
  /** Every repository the host stores. */
  readonly stored: readonly RepositoryDto[];
  /** The storage ids the platform's catalogue accounts for. */
  readonly catalogued: ReadonlySet<string>;
}

/**
 * The front door: the repositories this host stores that the platform no longer names.
 *
 * This page replaced the full storage catalogue, which listed every opaque id and answered no
 * question anyone had — a repository with a name is browsed through its Code page, where the name
 * is. What only this host can say is the **difference**: a storage row whose id qits-projects'
 * catalogue does not carry is a repository nothing links to, nothing backs up and nothing will
 * clean up, and surfacing those is the storage view's one real use.
 *
 * **Load budget: `2 + 0`.** The host's id list and the platform's flat catalogue, joined here;
 * nothing per row.
 *
 * **Both reads must succeed before anything is claimed.** An orphan is an id *absent* from a list,
 * and computing absence against a list that failed to load would name every repository an orphan —
 * the exact "plausible and wrong" answer the failed-load rule exists to prevent.
 *
 * **Still no clone address.** The ids are internal storage keys; an orphan by definition has no
 * public name to clone by — see {@link ./repository-fields}.
 */
@Component({
  selector: 'app-orphaned-repositories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Async, Empty, QitsButton],
  templateUrl: './orphaned-repositories-page.html',
  styleUrls: ['../ui/page.css', './orphaned-repositories-page.css'],
})
export class OrphanedRepositoriesPage {
  private readonly githost = inject(GithostApi);
  private readonly projects = inject(ProjectsApi);

  protected readonly audit = signal<Loadable<Audit>>(LOADING);

  /** The storage rows the catalogue does not account for. */
  protected readonly orphans = computed<readonly RepositoryDto[]>(() => {
    const state = this.audit();
    if (state.kind !== 'ready') {
      return [];
    }
    return state.value.stored.filter((repository) => !state.value.catalogued.has(repository.id));
  });

  /** `12 repositories in storage, 2 of them orphaned.` — the audit's outcome in one clause. */
  protected readonly lede = computed(() => {
    const state = this.audit();
    if (state.kind !== 'ready') {
      return '';
    }
    const stored = state.value.stored.length;
    const orphaned = this.orphans().length;
    return `${stored} ${stored === 1 ? 'repository' : 'repositories'} in storage, ${
      orphaned === 0 ? 'none' : orphaned
    } of them orphaned.`;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.audit.set(LOADING);
    try {
      const [stored, catalogue] = await Promise.all([
        this.githost.repositories(),
        this.projects.catalogue(),
      ]);
      this.audit.set(
        ready({ stored, catalogued: new Set(catalogue.map((repository) => repository.id)) }),
      );
    } catch (error) {
      this.audit.set(failed(error));
    }
  }

  /** What else the host said about this repository. Empty for a record of nothing but an id. */
  protected fieldsOf(repository: RepositoryDto): readonly RepositoryField[] {
    return extraFields(repository);
  }
}
