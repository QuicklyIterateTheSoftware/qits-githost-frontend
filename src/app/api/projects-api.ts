import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { QitsAppLinks } from '@qits/ui-components';
import { firstValueFrom } from 'rxjs';
import type {
  CommitChangesDto,
  CommitFileDiffDto,
  CommitLogDto,
  RepositoryCoordinatesDto,
} from './dto';

/**
 * What this app asks qits-projects directly.
 *
 * The flat repository catalogue is the join the orphaned-repositories view needs — a storage id
 * with no row here is a repository the platform no longer names. The commit reads back the commits
 * views: qits-projects mirrors every repository this host stores and already computes the log
 * range (all of main; `main..branch` elsewhere), the changed-file set and the per-file unified
 * diff, so the git host grows no log endpoint of its own.
 *
 * qits-projects answers on its own host, not this one: the edge routes an application's paths on
 * that application's host only. So every call here goes to `applications['qits-projects'].origin`
 * from the edge's `/main-navigation`, carries the session (`withCredentials` — the edge answers
 * credentialed CORS for any origin under the platform domain), and waits for the navigation to
 * answer rather than firing a relative path at this host first. Where the navigation names no
 * origin the path stays relative, same-origin — what an older edge still routes.
 *
 * The chrome's own reads (`/projects/api/projects`, the scoped repository list) stay in
 * `@qits/ui-components`.
 */
@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly http = inject(HttpClient);
  private readonly links = inject(QitsAppLinks);

  /** `path` on qits-projects' own origin, once the navigation has said where that is. */
  private url(path: string): Promise<string> {
    return this.links.whenApiUrl('qits-projects', path);
  }

  async catalogue(): Promise<readonly RepositoryCoordinatesDto[]> {
    const url = await this.url('/projects/api/repositories');
    const response = await firstValueFrom(
      this.http.get<{ readonly repositories: readonly RepositoryCoordinatesDto[] }>(url, {
        withCredentials: true,
      }),
    );
    return response?.repositories ?? [];
  }

  /** The branch's log: parent..branch, or the full history when no parent applies (main). */
  async commits(repoId: string, branch: string): Promise<CommitLogDto> {
    const url = await this.url(`/projects/api/repositories/${repoId}/commits`);
    return firstValueFrom(
      this.http.get<CommitLogDto>(url, { params: { branch }, withCredentials: true }),
    );
  }

  /** The files one commit changed, against its first parent. */
  async commitChanges(repoId: string, sha: string): Promise<CommitChangesDto> {
    const url = await this.url(`/projects/api/repositories/${repoId}/commits/${sha}/changes`);
    return firstValueFrom(this.http.get<CommitChangesDto>(url, { withCredentials: true }));
  }

  /** One file's unified diff within the commit. */
  async commitFileDiff(repoId: string, sha: string, path: string): Promise<CommitFileDiffDto> {
    const url = await this.url(`/projects/api/repositories/${repoId}/commits/${sha}/diff`);
    return firstValueFrom(
      this.http.get<CommitFileDiffDto>(url, { params: { path }, withCredentials: true }),
    );
  }
}
