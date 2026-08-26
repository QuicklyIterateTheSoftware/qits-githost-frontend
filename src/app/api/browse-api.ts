import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QITS_API_BASE } from './api-base';
import type { FileContentDto, LocSummaryDto, RepoDescribeDto, TreeListingDto } from './dto';

/**
 * The browse reads behind the Code page — `GET /githost/api/repositories/{id}[/tree|/file|/loc]`.
 *
 * Addressed by the storage UUID, which the page resolves from the URL's repository name via
 * `QITS_SCOPE.repositoryId()`. The rev travels as a query parameter, so a branch name with slashes
 * needs no encoding ceremony; `HttpClient`'s params encoder handles what does.
 *
 * Same transport stance as {@link GithostApi}: one-shot promises off `firstValueFrom`, failures
 * thrown rather than flattened. A thrown 404 carries a body naming WHICH thing is absent —
 * `no-such-repository`, `no-such-rev` or `no-such-path` — and {@link browseErrorCode} reads it, so
 * the page can draw "this repository is not on the git host" and "that branch does not exist" as
 * the different screens they are.
 */
@Injectable({ providedIn: 'root' })
export class BrowseApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(QITS_API_BASE);

  async describe(repoId: string): Promise<RepoDescribeDto> {
    return firstValueFrom(
      this.http.get<RepoDescribeDto>(`${this.base}/githost/api/repositories/${repoId}`),
    );
  }

  /** The whole tree at one rev, one request. No rev asks for the default branch. */
  async tree(repoId: string, rev?: string): Promise<TreeListingDto> {
    return firstValueFrom(
      this.http.get<TreeListingDto>(`${this.base}/githost/api/repositories/${repoId}/tree`, {
        params: rev ? { rev } : {},
      }),
    );
  }

  /** The rev's lines-of-code summary. No rev asks for the default branch, like the tree. */
  async loc(repoId: string, rev?: string): Promise<LocSummaryDto> {
    return firstValueFrom(
      this.http.get<LocSummaryDto>(`${this.base}/githost/api/repositories/${repoId}/loc`, {
        params: rev ? { rev } : {},
      }),
    );
  }

  async file(repoId: string, rev: string | undefined, path: string): Promise<FileContentDto> {
    return firstValueFrom(
      this.http.get<FileContentDto>(`${this.base}/githost/api/repositories/${repoId}/file`, {
        params: rev ? { rev, path } : { path },
      }),
    );
  }
}

/** The `error` code of a browse 404's body, or null for any other failure. */
export function browseErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
    return null;
  }
  const body: unknown = error.error;
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const code = (body as { error: unknown }).error;
    return typeof code === 'string' ? code : null;
  }
  return null;
}
