import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QITS_API_BASE } from './api-base';
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
 * The chrome's own reads (`/projects/api/projects`, the scoped repository list) stay in
 * `@qits/ui-components`.
 */
@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(QITS_API_BASE);

  async catalogue(): Promise<readonly RepositoryCoordinatesDto[]> {
    const response = await firstValueFrom(
      this.http.get<{ readonly repositories: readonly RepositoryCoordinatesDto[] }>(
        `${this.base}/projects/api/repositories`,
      ),
    );
    return response?.repositories ?? [];
  }

  /** The branch's log: parent..branch, or the full history when no parent applies (main). */
  async commits(repoId: string, branch: string): Promise<CommitLogDto> {
    return firstValueFrom(
      this.http.get<CommitLogDto>(`${this.base}/projects/api/repositories/${repoId}/commits`, {
        params: { branch },
      }),
    );
  }

  /** The files one commit changed, against its first parent. */
  async commitChanges(repoId: string, sha: string): Promise<CommitChangesDto> {
    return firstValueFrom(
      this.http.get<CommitChangesDto>(
        `${this.base}/projects/api/repositories/${repoId}/commits/${sha}/changes`,
      ),
    );
  }

  /** One file's unified diff within the commit. */
  async commitFileDiff(repoId: string, sha: string, path: string): Promise<CommitFileDiffDto> {
    return firstValueFrom(
      this.http.get<CommitFileDiffDto>(
        `${this.base}/projects/api/repositories/${repoId}/commits/${sha}/diff`,
        { params: { path } },
      ),
    );
  }
}
