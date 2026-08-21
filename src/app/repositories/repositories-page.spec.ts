import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigationLinks } from '@qits/ui-components';
import { routes } from '../app.routes';
import type { RepositoryDto } from '../api/dto';

/** Storage ids as the host really mints them: opaque, and readable as nothing but a key. */
const CI = '3f6c1a9e-0b25-4d1e-9c77-2a0e5b8f4d31';
const SPA = '8d2b47c0-5e19-4a63-b0f8-71c9e4a26d55';
const WORKSPACES = 'c1a70f38-9d64-4b02-8e5a-6f3d18b7c920';

/**
 * The catalogue, one state at a time.
 *
 * Three assertions here are about honesty rather than rendering, and they are the ones worth keeping
 * if the rest are ever trimmed: a failed load says so instead of drawing an empty host, the page
 * costs one request whatever the host holds, and no row offers a clone address — the ids are
 * internal storage keys and `/git/<id>` is a route the reader may not call.
 */
describe('RepositoriesPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideQitsNavigationLinks([{ label: 'Git host', href: '/githost/' }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function open(): Promise<void> {
    harness = await RouterTestingHarness.create('/');
  }

  function page(): HTMLElement {
    return harness.fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return page().textContent ?? '';
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 6; round += 1) {
      await Promise.resolve();
      await harness.fixture.whenStable();
    }
  }

  function flush(repositories: readonly RepositoryDto[]): void {
    http.expectOne('/githost/api/repositories').flush({ repositories });
  }

  it('lists every repository by its storage id, and reads one request to do it', async () => {
    await open();
    flush([{ id: CI }, { id: SPA }, { id: WORKSPACES }]);
    await settle();

    expect(text()).toContain(CI);
    expect(text()).toContain(WORKSPACES);
    expect(text()).toContain('3 repositories.');
    expect(page().querySelectorAll('tbody tr')).toHaveLength(3);
    // The variable term of the load budget is zero: nothing is read per row.
    http.verify();
  });

  it('offers no clone address: an id-addressed one would be internal and unusable', async () => {
    await open();
    flush([{ id: CI }]);
    await settle();

    expect(text()).not.toContain(`/git/${CI}`);
    expect(text()).not.toContain('Clone address');
    expect(page().querySelector('tbody a')).toBeNull();
    // The reader is told where the address does live.
    expect(text()).toContain('Projects');
  });

  it('shows the fields the service chose to send, and misses none it did not', async () => {
    await open();
    flush([{ id: CI, defaultBranch: 'main', branchCount: 3 }, { id: SPA }]);
    await settle();

    expect(text()).toContain('defaultBranch');
    expect(text()).toContain('main');
    expect(text()).toContain('branchCount');
    expect(text()).toContain('nothing beyond the id');
  });

  it('says an empty host is empty', async () => {
    await open();
    flush([]);
    await settle();

    expect(text()).toContain('serves no repositories yet');
    expect(text()).toContain('0 repositories.');
  });

  it('says a failed load failed, and offers a way back — never an empty list', async () => {
    await open();
    http
      .expectOne('/githost/api/repositories')
      .flush(
        { message: 'catalog unavailable' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    await settle();

    expect(text()).toContain('Could not load the repositories');
    expect(text()).toContain('503 catalog unavailable');
    expect(text()).not.toContain('serves no repositories yet');
    expect(page().querySelector('table')).toBeNull();
    expect(page().querySelector('[role="alert"]')).not.toBeNull();
  });

  it('retries the read on request', async () => {
    await open();
    http.expectOne('/githost/api/repositories').error(new ProgressEvent('error'));
    await settle();
    expect(text()).toContain('the service is unreachable');

    const retry = page().querySelector('[role="alert"] button') as HTMLButtonElement;
    retry.click();
    await settle();
    flush([{ id: CI }]);
    await settle();

    expect(text()).toContain(CI);
  });
});
