import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QITS_API_BASE } from './api-base';
import type { RepositoryCoordinatesDto } from './dto';

/**
 * The one thing this app asks qits-projects directly: the flat repository catalogue, id beside
 * name for every repository on the platform. It is the join the orphaned-repositories view needs —
 * a storage id with no row here is a repository the platform no longer names.
 *
 * The chrome's own reads (`/projects/api/projects`, the scoped repository list) stay in
 * `@qits/ui-components`; this client exists only for the host-wide join, which no scoped list
 * answers.
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
}
