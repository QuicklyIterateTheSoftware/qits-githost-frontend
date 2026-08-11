import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QITS_API_BASE } from './api-base';
import type { RepositoriesResponse, RepositoryDto } from './dto';

/**
 * Everything this app reads, and it reads from one upstream: qits-githost, at `/githost/api`.
 *
 * The call is one-shot — `firstValueFrom` unwraps the observable immediately, because a promise is
 * what the page's `async` methods want. `HttpClient` on the fetch backend rather than bare `fetch()`
 * buys two things: `HttpTestingController`, which is the basis of this repository's specs, and a
 * call that goes through `window.fetch`, where the platform's browser telemetry can see it.
 *
 * **A failure is thrown, never flattened to an empty list.** "I could not ask" and "there are no
 * repositories" are different answers, and the page draws them differently.
 */
@Injectable({ providedIn: 'root' })
export class GithostApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(QITS_API_BASE);

  /**
   * Every repository the git host serves.
   *
   * The envelope is unwrapped with a fallback for one narrow case: a service that answers `200` with
   * no `repositories` key. That is an empty host, not a crash — the alternative is a `TypeError` in
   * a component, which reads as a bug in this app rather than as a thin answer from the service.
   */
  async repositories(): Promise<readonly RepositoryDto[]> {
    const response = await firstValueFrom(
      this.http.get<RepositoriesResponse>(`${this.base}/githost/api/repositories`),
    );
    return response?.repositories ?? [];
  }
}
