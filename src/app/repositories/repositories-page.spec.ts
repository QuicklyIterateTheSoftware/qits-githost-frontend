import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigationLinks } from '@qits/ui-components';
import { routes } from '../app.routes';
import type { RepositoryDto } from '../api/dto';

/**
 * The catalogue, one state at a time.
 *
 * Two assertions here are about honesty rather than rendering, and they are the ones worth keeping
 * if the rest are ever trimmed: a failed load says so instead of drawing an empty host, and the
 * page costs one request whatever the host holds.
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

  it('lists every repository with its clone address, and reads one request to do it', async () => {
    await open();
    flush([{ id: 'qits-ci' }, { id: 'qits-spa-githost' }, { id: 'qits-workspaces' }]);
    await settle();

    expect(text()).toContain('qits-ci');
    expect(text()).toContain('/git/qits-ci');
    expect(text()).toContain('/git/qits-workspaces');
    expect(text()).toContain('3 repositories.');
    expect(page().querySelectorAll('tbody tr')).toHaveLength(3);
    // The variable term of the load budget is zero: nothing is read per row.
    http.verify();
  });

  it('shows the fields the service chose to send, and misses none it did not', async () => {
    await open();
    flush([{ id: 'qits-ci', defaultBranch: 'main', branchCount: 3 }, { id: 'plain' }]);
    await settle();

    expect(text()).toContain('defaultBranch');
    expect(text()).toContain('main');
    expect(text()).toContain('branchCount');
    expect(text()).toContain('nothing beyond the name');
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
    flush([{ id: 'qits-ci' }]);
    await settle();

    expect(text()).toContain('/git/qits-ci');
  });
});
