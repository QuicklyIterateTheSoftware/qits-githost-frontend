import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigationLinks } from '@qits/ui-components';
import { routes } from '../app.routes';
import type { RepositoryCoordinatesDto, RepositoryDto } from '../api/dto';

/** Storage ids as the host really mints them: opaque, and readable as nothing but a key. */
const CI = '3f6c1a9e-0b25-4d1e-9c77-2a0e5b8f4d31';
const SPA = '8d2b47c0-5e19-4a63-b0f8-71c9e4a26d55';
const ORPHAN = 'c1a70f38-9d64-4b02-8e5a-6f3d18b7c920';

const PROJECT = 'a4d9e2f1-6c38-4b57-9a01-8e2f5c7d3b60';

/**
 * The storage audit, one state at a time.
 *
 * The assertions worth keeping if the rest are ever trimmed: an orphan is the DIFFERENCE of two
 * successful reads and is never claimed while either is missing, a failed load says so instead of
 * naming every repository an orphan, and no row offers a clone address — an orphan by definition
 * has no name to clone by.
 */
describe('OrphanedRepositoriesPage', () => {
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

  function flushStored(repositories: readonly RepositoryDto[]): void {
    http.expectOne('/githost/api/repositories').flush({ repositories });
  }

  function flushCatalogue(repositories: readonly RepositoryCoordinatesDto[]): void {
    http.expectOne('/projects/api/repositories').flush({ repositories });
  }

  function catalogued(id: string, name: string): RepositoryCoordinatesDto {
    return { id, projectId: PROJECT, name, mainBranch: 'main' };
  }

  it('lists exactly the stored repositories the catalogue does not name', async () => {
    await open();
    flushStored([{ id: CI }, { id: SPA }, { id: ORPHAN }]);
    flushCatalogue([catalogued(CI, 'qits-ci'), catalogued(SPA, 'qits-spa-home')]);
    await settle();

    expect(text()).toContain(ORPHAN);
    expect(text()).not.toContain(CI);
    expect(page().querySelectorAll('tbody tr')).toHaveLength(1);
    expect(text()).toContain('3 repositories in storage, 1 of them orphaned.');
  });

  it('says a fully accounted-for host has no orphans, in a sentence', async () => {
    await open();
    flushStored([{ id: CI }]);
    flushCatalogue([catalogued(CI, 'qits-ci')]);
    await settle();

    expect(text()).toContain('No orphaned repositories');
    expect(text()).toContain('1 repository in storage, none of them orphaned.');
  });

  it('shows the fields the host chose to send about an orphan, and offers no clone address', async () => {
    await open();
    flushStored([{ id: ORPHAN, protectDefaultBranch: true }]);
    flushCatalogue([]);
    await settle();

    expect(text()).toContain('protectDefaultBranch');
    expect(text()).not.toContain(`/git/${ORPHAN}`);
    expect(page().querySelector('tbody a')).toBeNull();
  });

  it('claims nothing while the catalogue read failed — absence needs both answers', async () => {
    await open();
    flushStored([{ id: ORPHAN }]);
    http
      .expectOne('/projects/api/repositories')
      .flush({ message: 'catalogue unavailable' }, { status: 503, statusText: 'Unavailable' });
    await settle();

    expect(text()).toContain('Could not audit the stored repositories');
    expect(text()).not.toContain(ORPHAN);
    expect(page().querySelector('table')).toBeNull();
    expect(page().querySelector('[role="alert"]')).not.toBeNull();
  });

  it('retries both reads on request', async () => {
    await open();
    http.expectOne('/githost/api/repositories').error(new ProgressEvent('error'));
    http.expectOne('/projects/api/repositories').flush({ repositories: [] });
    await settle();
    expect(text()).toContain('the service is unreachable');

    const retry = page().querySelector('[role="alert"] button') as HTMLButtonElement;
    retry.click();
    await settle();
    flushStored([{ id: ORPHAN }]);
    flushCatalogue([]);
    await settle();

    expect(text()).toContain(ORPHAN);
  });
});
