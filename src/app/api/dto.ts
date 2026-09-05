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
 * The browse endpoints' shapes — `GET /githost/api/repositories/{id}[/tags|/tree|/file|/loc]`.
 * Unlike the catalogue record above, these are closed contracts: the Code page depends on every
 * field.
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

/**
 * One tag (`GET …/tags`). `commitSha` is the PEELED commit — an annotated tag's own object sha is
 * not something a tree read can be taken at — and `taggedAt` is null for a tag whose object carries
 * no ident at all.
 */
export interface RepoTagDto {
  readonly name: string;
  readonly commitSha: string;
  /** ISO-8601: the tagger's clock for an annotated tag, the committer's for a lightweight one. */
  readonly taggedAt: string | null;
}

/** The repository's tags, newest first as the service sorted them and rendered in that order. */
export interface RepoTagsDto {
  readonly id: string;
  readonly tags: readonly RepoTagDto[];
}

/** One language's line counts at the commit, split the way the Code page draws them. */
export interface LanguageLocDto {
  readonly language: string;
  readonly mainLines: number;
  readonly testLines: number;
}

/**
 * The lines-of-code summary at one commit (`GET …/loc`). A pure function of `commitSha` — the
 * service memoizes it under that key, which is why no rev is echoed back: every spelling of the
 * same commit gets the same bytes.
 */
export interface LocSummaryDto {
  readonly commitSha: string;
  /** Sorted largest total first by the service; rendered as received. */
  readonly languages: readonly LanguageLocDto[];
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

/**
 * The commit shapes qits-projects answers (`GET /projects/api/repositories/{id}/commits…`). That
 * service reads them off its own mirror of this host's repositories, which is why the commits
 * views ask it rather than the git host: the range arithmetic — everything on main, only the
 * unmerged commits on any other branch — already lives there.
 */
export interface CommitDto {
  readonly hash: string;
  readonly shortHash: string;
  readonly author: string;
  readonly email: string;
  /** Committer date, strict ISO-8601. */
  readonly date: string;
  /** The commit subject (first line). */
  readonly message: string;
  /** The paths the commit changed. Empty for merge commits (git omits them under --name-only). */
  readonly files: readonly string[];
}

/**
 * The log for a branch. `parent` is the branch the range was computed against; null means no
 * parent applied and the FULL history came back — which is exactly the main-branch case.
 */
export interface CommitLogDto {
  readonly branch: string;
  readonly parent: string | null;
  readonly commits: readonly CommitDto[];
}

/** One file a commit touched. `oldPath` is non-null only for renames/copies. */
export interface CommitFileChangeDto {
  readonly path: string;
  readonly oldPath: string | null;
  readonly changeType: 'ADDED' | 'MODIFIED' | 'DELETED' | 'RENAMED' | 'COPIED' | 'TYPE_CHANGED';
}

/** What a commit changed relative to its diff base (its first parent unless one was named). */
export interface CommitChangesDto {
  readonly commit: string;
  readonly parent: string | null;
  readonly files: readonly CommitFileChangeDto[];
}

/** One file's unified diff. Empty `diff` means no textual change — binary, or a pure rename. */
export interface CommitFileDiffDto {
  readonly path: string;
  readonly changeType: string;
  readonly diff: string;
}
