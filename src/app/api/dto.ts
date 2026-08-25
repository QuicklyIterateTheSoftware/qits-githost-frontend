/**
 * The wire shapes qits-githost answers with, as this application reads them.
 *
 * **`id` is the only field this app may depend on**, and it is a storage key, not a name. The
 * service is being built beside this client
 * and its repository record is expected to grow — a description, a default branch, a size, a
 * timestamp. So the type states the one guaranteed field and keeps the rest open: an unknown field
 * is data to show, not an error, and a missing one is simply absent. Naming fields here that the
 * service does not send yet would put empty columns on screen and would make every addition a
 * release of this repository first.
 */
export interface RepositoryDto {
  /**
   * The opaque storage key this host files the repository under. Always present.
   *
   * It is minted by qits-projects and means nothing on its own: not a name, not an address. The
   * repository's public name and clone address live in qits-projects, which is the service that
   * knows which project the repository belongs to.
   */
  readonly id: string;
  /** Anything else the service chose to send. Rendered as a label and a value, never assumed. */
  readonly [field: string]: unknown;
}

export interface RepositoriesResponse {
  readonly repositories: readonly RepositoryDto[];
}

/**
 * The browse endpoints' shapes — `GET /githost/api/repositories/{id}[/tree|/file]`. Unlike the
 * catalogue record above, these are closed contracts: the Code page depends on every field.
 */
export interface RepoDescribeDto {
  readonly id: string;
  /** The branch HEAD names — real even for an empty repository, whose branch is merely unborn. */
  readonly defaultBranch: string | null;
  /** Short branch names, sorted. Empty means an empty repository: nothing to browse yet. */
  readonly branches: readonly string[];
}

export interface TreeListingDto {
  /** The rev the listing answers for — what was asked, or the default branch when nothing was. */
  readonly rev: string;
  /** The commit the rev resolved to. */
  readonly commitSha: string;
  /** Every blob's slash-separated path. Directories are implied and derived client-side. */
  readonly paths: readonly string[];
}

export interface FileContentDto {
  readonly path: string;
  /** True for a genuinely binary blob AND for one past the 2 MiB cap; `size` says which. */
  readonly binary: boolean;
  /** The blob's real size in bytes, cap or no cap. */
  readonly size: number;
  /** Absent when binary; `''` for a genuinely empty file. */
  readonly content?: string;
}

/**
 * One repository as qits-projects' flat catalogue spells it (`GET /projects/api/repositories`) —
 * the join key between this host's opaque storage ids and the platform's public names.
 */
export interface RepositoryCoordinatesDto {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly mainBranch: string;
}
