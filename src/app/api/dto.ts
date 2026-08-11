/**
 * The wire shapes qits-githost answers with, as this application reads them.
 *
 * **`id` is the only field this app may depend on.** The service is being built beside this client
 * and its repository record is expected to grow — a description, a default branch, a size, a
 * timestamp. So the type states the one guaranteed field and keeps the rest open: an unknown field
 * is data to show, not an error, and a missing one is simply absent. Naming fields here that the
 * service does not send yet would put empty columns on screen and would make every addition a
 * release of this repository first.
 */
export interface RepositoryDto {
  /** The repository name, and the last segment of its clone address. Always present. */
  readonly id: string;
  /** Anything else the service chose to send. Rendered as a label and a value, never assumed. */
  readonly [field: string]: unknown;
}

export interface RepositoriesResponse {
  readonly repositories: readonly RepositoryDto[];
}
