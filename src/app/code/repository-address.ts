import { scopeGroup, type QitsScope } from '@qits/ui-components';

/** The three segments a repository page's URL is built from: `/<project>/<group>/<repository>/…`. */
export interface RepositoryAddress {
  readonly project?: string;
  readonly group?: string;
  readonly repository?: string;
}

/**
 * The address the chrome's scope states, with the middle segment read as the **group**.
 *
 * The group is the repository's component — `qits-ci` — where the platform gives it one, and its
 * archetype category where it does not. `QitsScope.category` is only the second of those two
 * spellings, so reading it directly left every component address without a middle segment: the
 * bare-repo redirect to `branches/<default>` never fired and the page spun forever on its spinner.
 * `scopeGroup` is the one place that knows the two fields are one segment.
 */
export function repositoryAddress(scope: QitsScope): RepositoryAddress {
  return { project: scope.project, group: scopeGroup(scope), repository: scope.repository };
}
