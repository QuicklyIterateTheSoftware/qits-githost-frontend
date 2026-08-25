import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  provideQitsNavigationLinks,
  provideQitsProjectList,
  provideQitsRepositoryList,
  provideQitsScope,
} from '@qits/ui-components';
import { routes } from '../app.routes';

const REPO_ID = '3f6c1a9e-0b25-4d1e-9c77-2a0e5b8f4d31';
const API = `/githost/api/repositories/${REPO_ID}`;

/**
 * The Code page through the real route table: the URL is the state, so the specs drive URLs and
 * read the DOM. The slug→UUID join runs against literal project/repository lists — the same
 * providers the chrome's own specs use — so the page's requests are the only HTTP here.
 */
describe('CodePage', () => {
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
        provideQitsProjectList([{ id: 'p-1', slug: 'qits', name: 'qits' }]),
        provideQitsRepositoryList([{ id: REPO_ID, name: 'qits-ci', category: 'services' }]),
        provideQitsScope('repository'),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function page(): HTMLElement {
    return harness.fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return page().textContent ?? '';
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 8; round += 1) {
      await Promise.resolve();
      await harness.fixture.whenStable();
    }
  }

  function flushDescribe(branches: readonly string[]): void {
    http
      .expectOne(API)
      .flush({ id: REPO_ID, defaultBranch: 'main', branches });
  }

  it('resolves the repository name to its storage id and draws the default-branch tree', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci');
    await settle();
    flushDescribe(['main']);
    await settle();
    http
      .expectOne(`${API}/tree`)
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['README.md', 'src/app/main.ts'] });
    await settle();

    expect(text()).toContain('qits-ci');
    expect(text()).toContain('main');
    expect(text()).toContain('README.md');
    expect(text()).toContain('src');
    // The deep path's file is behind its closed directory, not lost.
    expect(text()).not.toContain('main.ts');
    expect(text()).toContain('Select a file to view its contents.');
    // The orthogonal view is one press away.
    expect(page().querySelector('.view-switch')?.textContent).toContain('Commits');
  });

  it('reads the rev from the URL tail, slashes intact', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/branches/feature/slashy');
    await settle();
    flushDescribe(['feature/slashy', 'main']);
    await settle();
    http
      .expectOne(
        (request) =>
          request.url === `${API}/tree` && request.params.get('rev') === 'feature/slashy',
      )
      .flush({ rev: 'feature/slashy', commitSha: 'b'.repeat(40), paths: ['README.md'] });
    await settle();

    expect(text()).toContain('feature/slashy');
    expect(text()).toContain('README.md');
  });

  it('opens the ?path= file in the viewer with its ancestors expanded', async () => {
    harness = await RouterTestingHarness.create(
      '/qits/services/qits-ci?path=src/app/main.ts&lines=2',
    );
    await settle();
    flushDescribe(['main']);
    await settle();
    http
      .expectOne(`${API}/tree`)
      .flush({ rev: 'main', commitSha: 'c'.repeat(40), paths: ['src/app/main.ts'] });
    await settle();
    http
      .expectOne(
        (request) =>
          request.url === `${API}/file` && request.params.get('path') === 'src/app/main.ts',
      )
      .flush({ path: 'src/app/main.ts', binary: false, size: 12, content: 'one\ntwo\n' });
    await settle();

    // The tree shows the deep file because its ancestors were auto-expanded…
    expect(text()).toContain('main.ts');
    // …and the viewer shows the content with the anchored line painted.
    expect(text()).toContain('two');
    expect(page().querySelector('.line.anchored')?.textContent).toContain('two');
  });

  it('says an empty repository is empty instead of asking for a tree', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci');
    await settle();
    flushDescribe([]);
    await settle();

    expect(text()).toContain('Empty repository');
    // No tree request was made — verified by afterEach's http.verify().
  });

  it('names a rev that does not exist and offers the way back', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/branches/gone');
    await settle();
    flushDescribe(['main']);
    await settle();
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'gone')
      .flush({ error: 'no-such-rev' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(text()).toContain('There is no');
    expect(text()).toContain('gone');
    expect(text()).toContain('Go to the default branch');
  });

  it('says a repository the host does not hold is not there yet', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci');
    await settle();
    http
      .expectOne(API)
      .flush({ error: 'no-such-repository' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(text()).toContain('the git host does not hold it yet');
  });

  it('says a repository name the project does not have is unknown', async () => {
    harness = await RouterTestingHarness.create('/qits/services/no-such-repo');
    await settle();

    expect(text()).toContain('No repository named no-such-repo');
    http.verify();
  });
});
