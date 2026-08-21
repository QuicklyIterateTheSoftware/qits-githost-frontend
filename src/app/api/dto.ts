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
