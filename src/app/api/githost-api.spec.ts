import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { GithostApi } from './githost-api';

/**
 * The path and the envelope, pinned here so the page's spec can be about rendering.
 *
 * This is a same-origin absolute path on purpose — the SPA is served at `/githost/` by the very
 * service it reads from, and the read carries no credential.
 *
 * The backend is being built against this contract in parallel, so this file is where the contract
 * lives: a path or an envelope that changes shape breaks here first, loudly, rather than at runtime.
 */
describe('GithostApi', () => {
  let api: GithostApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(GithostApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('unwraps the repositories from the envelope', async () => {
    const repositories = api.repositories();
    http
      .expectOne('/githost/api/repositories')
      .flush({ repositories: [{ id: 'qits-ci' }, { id: 'qits-spa-githost' }] });
    await expect(repositories).resolves.toMatchObject([
      { id: 'qits-ci' },
      { id: 'qits-spa-githost' },
    ]);
  });

  it('keeps every field the service sends, named or not', async () => {
    const repositories = api.repositories();
    http.expectOne('/githost/api/repositories').flush({
      repositories: [{ id: 'qits-ci', defaultBranch: 'main', branchCount: 3 }],
    });
    await expect(repositories).resolves.toMatchObject([
      { id: 'qits-ci', defaultBranch: 'main', branchCount: 3 },
    ]);
  });

  it('reads a host with no repositories as an empty list', async () => {
    const repositories = api.repositories();
    http.expectOne('/githost/api/repositories').flush({ repositories: [] });
    await expect(repositories).resolves.toEqual([]);
  });

  it('survives an answer with no repositories key at all', async () => {
    const repositories = api.repositories();
    http.expectOne('/githost/api/repositories').flush({});
    await expect(repositories).resolves.toEqual([]);
  });

  // A failure must reach the caller. Flattening it to an empty list here would draw a working host
  // with nothing in it, which is the one thing this page must never claim.
  it('throws when the service refuses', async () => {
    const repositories = api.repositories();
    http
      .expectOne('/githost/api/repositories')
      .flush(
        { message: 'catalog unavailable' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    await expect(repositories).rejects.toBeInstanceOf(HttpErrorResponse);
  });
});
