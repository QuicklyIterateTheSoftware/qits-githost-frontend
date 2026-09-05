import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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
 *
 * The repository carries a component, so both middle spellings are addressable: `/qits/services/…`
 * is the archetype form and `/qits/qits-ci/…` the component form the platform's navigation links.
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
        provideQitsRepositoryList([
          { id: REPO_ID, name: 'qits-ci', component: 'qits-ci', category: 'services' },
        ]),
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

  /** The tag list rides beside every describe, so a spec that flushes one flushes both. */
  function flushTags(names: readonly string[] = []): void {
    http.expectOne(`${API}/tags`).flush({
      id: REPO_ID,
      tags: names.map((name) => ({
        name,
        commitSha: 'd'.repeat(40),
        taggedAt: '2026-09-03T10:00:00Z',
      })),
    });
  }

  /** The loc summary rides beside every tree read; a spec that spells a rev must flush it too. */
  function flushLoc(
    rev: string,
    languages: readonly { language: string; mainLines: number; testLines: number }[] = [],
  ): void {
    http
      .expectOne((request) => request.url === `${API}/loc` && request.params.get('rev') === rev)
      .flush({ commitSha: 'a'.repeat(40), languages });
  }

  it('redirects the bare address to branches/<default> and draws that tree', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci');
    await settle();
    flushDescribe(['main']);
    flushTags();
    await settle();
    // The address now SPELLS the branch — the bare form was a redirector.
    expect(TestBed.inject(Router).url).toContain('/qits/services/qits-ci/branches/main');
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['README.md', 'src/app/main.ts'] });
    flushLoc('main');
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
    flushTags();
    await settle();
    http
      .expectOne(
        (request) =>
          request.url === `${API}/tree` && request.params.get('rev') === 'feature/slashy',
      )
      .flush({ rev: 'feature/slashy', commitSha: 'b'.repeat(40), paths: ['README.md'] });
    flushLoc('feature/slashy');
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
    flushTags();
    await settle();
    // The redirect carried the deep link's query along (the serializer respells the slashes).
    expect(TestBed.inject(Router).url).toContain('/branches/main');
    expect(TestBed.inject(Router).url).toContain('path=src%2Fapp%2Fmain.ts');
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'c'.repeat(40), paths: ['src/app/main.ts'] });
    flushLoc('main');
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

  it('draws per-language line counts split test and main below the tree', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/branches/main');
    await settle();
    flushDescribe(['main']);
    flushTags();
    await settle();
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['README.md'] });
    flushLoc('main', [
      { language: 'Java', mainLines: 50, testLines: 500 },
      { language: 'TypeScript', mainLines: 1234, testLines: 0 },
    ]);
    await settle();

    const headers = Array.from(page().querySelectorAll('app-loc-panel .lang')).map(
      (header) => header.textContent?.trim(),
    );
    expect(headers).toEqual(['Java', 'TypeScript']);
    const panel = page().querySelector('app-loc-panel')?.textContent ?? '';
    expect(panel).toContain('test');
    expect(panel).toContain('500 loc');
    expect(panel).toContain('main');
    expect(panel).toContain('50 loc');
    expect(panel).toContain('1,234 loc');
  });

  it('says line counts are unavailable when the loc read fails, tree intact', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/branches/main');
    await settle();
    flushDescribe(['main']);
    flushTags();
    await settle();
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['README.md'] });
    http
      .expectOne((request) => request.url === `${API}/loc` && request.params.get('rev') === 'main')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(text()).toContain('README.md');
    expect(text()).toContain('Line counts unavailable.');
    expect(page().querySelector('app-loc-panel')).toBeNull();
  });

  it('hides the loc panel entirely when no language is recognised', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/branches/main');
    await settle();
    flushDescribe(['main']);
    flushTags();
    await settle();
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['LICENSE'] });
    flushLoc('main', []);
    await settle();

    expect(page().querySelector('app-loc-panel')).toBeNull();
    expect(text()).not.toContain('Line counts unavailable.');
  });

  it('says an empty repository is empty instead of asking for a tree', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci');
    await settle();
    flushDescribe([]);
    flushTags();
    await settle();

    expect(text()).toContain('Empty repository');
    // No tree request was made — verified by afterEach's http.verify().
  });

  it('names a rev that does not exist and offers the way back', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/branches/gone');
    await settle();
    flushDescribe(['main']);
    flushTags();
    await settle();
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'gone')
      .flush({ error: 'no-such-rev' }, { status: 404, statusText: 'Not Found' });
    http
      .expectOne((request) => request.url === `${API}/loc` && request.params.get('rev') === 'gone')
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
    http
      .expectOne(`${API}/tags`)
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

  /**
   * The component form of the same address. The chrome states the middle segment as `group` and
   * leaves `category` unset for it, so a page that read `category` never redirected here — the
   * live symptom was an endless spinner on every component-form Code page.
   */
  it('redirects the bare COMPONENT-form address to branches/<default> and draws that tree', async () => {
    harness = await RouterTestingHarness.create('/qits/qits-ci/qits-ci');
    await settle();
    flushDescribe(['main']);
    flushTags();
    await settle();

    expect(TestBed.inject(Router).url).toContain('/qits/qits-ci/qits-ci/branches/main');
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['README.md'] });
    flushLoc('main');
    await settle();

    expect(text()).toContain('README.md');
    expect(text()).not.toContain('Resolving the repository');
  });

  it('keeps the component segment when the branch dropdown navigates', async () => {
    harness = await RouterTestingHarness.create('/qits/qits-ci/qits-ci/branches/main');
    await settle();
    flushDescribe(['main', 'topic']);
    flushTags();
    await settle();
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['README.md'] });
    flushLoc('main');
    await settle();

    const select = page().querySelector('select') as HTMLSelectElement;
    select.value = 'branches/topic';
    select.dispatchEvent(new Event('change'));
    await settle();

    expect(TestBed.inject(Router).url).toContain('/qits/qits-ci/qits-ci/branches/topic');
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'topic')
      .flush({ rev: 'topic', commitSha: 'b'.repeat(40), paths: ['TOPIC.md'] });
    flushLoc('topic');
    await settle();

    expect(text()).toContain('TOPIC.md');
  });

  it('switches to the commits view without losing the component segment', async () => {
    harness = await RouterTestingHarness.create('/qits/qits-ci/qits-ci/branches/main');
    await settle();
    flushDescribe(['main']);
    flushTags();
    await settle();
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['README.md'] });
    flushLoc('main');
    await settle();

    (page().querySelector('.view-switch') as HTMLButtonElement).click();
    await settle();

    expect(TestBed.inject(Router).url).toContain('/qits/qits-ci/qits-ci/commits/main');
    // The commits page the navigation landed on makes its own reads; drain them.
    http.expectOne(API).flush({ id: REPO_ID, defaultBranch: 'main', branches: ['main'] });
    await settle();
    http
      .expectOne((request) => request.url === `/projects/api/repositories/${REPO_ID}/commits`)
      .flush({ branch: 'main', parent: null, commits: [] });
  });

  /**
   * A tag address asks for the FULL ref. That is what makes a tag and a branch of the same name two
   * places rather than whichever one git resolved first — and the reader never sees the prefix.
   */
  it('asks for refs/tags/<name> at a tag address and shows the bare name', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/tags/2026.903.113443');
    await settle();
    flushDescribe(['main']);
    flushTags(['2026.903.113443']);
    await settle();
    http
      .expectOne(
        (request) =>
          request.url === `${API}/tree` &&
          request.params.get('rev') === 'refs/tags/2026.903.113443',
      )
      .flush({
        rev: 'refs/tags/2026.903.113443',
        commitSha: 'e'.repeat(40),
        paths: ['README.md'],
      });
    flushLoc('refs/tags/2026.903.113443');
    await settle();

    expect(text()).toContain('README.md');
    expect(text()).toContain('2026.903.113443');
    expect(text()).not.toContain('refs/tags/');
  });

  it('draws the dropdown as branches and tags, tags in the order served', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/branches/main');
    await settle();
    flushDescribe(['main', 'topic']);
    flushTags(['2026.903.113443', '2026.831.090000']);
    await settle();
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['README.md'] });
    flushLoc('main');
    await settle();

    const groups = Array.from(page().querySelectorAll('optgroup'));
    expect(groups.map((group) => group.getAttribute('label'))).toEqual(['Branches', 'Tags']);
    const values = Array.from(page().querySelectorAll('option')).map((option) => option.value);
    expect(values).toEqual([
      'branches/main',
      'branches/topic',
      'tags/2026.903.113443',
      'tags/2026.831.090000',
    ]);
    expect((page().querySelector('select') as HTMLSelectElement).value).toBe('branches/main');
  });

  it('navigates to tags/<name> when a tag is picked, and back to branches/<name>', async () => {
    harness = await RouterTestingHarness.create('/qits/qits-ci/qits-ci/branches/main');
    await settle();
    flushDescribe(['main']);
    flushTags(['2026.903.113443']);
    await settle();
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['README.md'] });
    flushLoc('main');
    await settle();

    const select = page().querySelector('select') as HTMLSelectElement;
    select.value = 'tags/2026.903.113443';
    select.dispatchEvent(new Event('change'));
    await settle();

    expect(TestBed.inject(Router).url).toContain('/qits/qits-ci/qits-ci/tags/2026.903.113443');
    http
      .expectOne(
        (request) =>
          request.url === `${API}/tree` &&
          request.params.get('rev') === 'refs/tags/2026.903.113443',
      )
      .flush({ rev: 'refs/tags/2026.903.113443', commitSha: 'e'.repeat(40), paths: ['TAG.md'] });
    flushLoc('refs/tags/2026.903.113443');
    await settle();
    expect(text()).toContain('TAG.md');

    select.value = 'branches/main';
    select.dispatchEvent(new Event('change'));
    await settle();

    expect(TestBed.inject(Router).url).toContain('/qits/qits-ci/qits-ci/branches/main');
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['README.md'] });
    flushLoc('main');
    await settle();
    expect(text()).toContain('README.md');
  });

  it('offers branches alone when the tag read fails, page intact', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/branches/main');
    await settle();
    flushDescribe(['main']);
    http.expectOne(`${API}/tags`).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();
    http
      .expectOne((request) => request.url === `${API}/tree` && request.params.get('rev') === 'main')
      .flush({ rev: 'main', commitSha: 'a'.repeat(40), paths: ['README.md'] });
    flushLoc('main');
    await settle();

    expect(text()).toContain('README.md');
    expect(page().querySelectorAll('optgroup').length).toBe(1);
    expect(page().querySelector('optgroup')?.getAttribute('label')).toBe('Branches');
  });

  it('names a tag that does not exist and offers the way back', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/tags/2026.101.000000');
    await settle();
    flushDescribe(['main']);
    flushTags();
    await settle();
    http
      .expectOne(
        (request) =>
          request.url === `${API}/tree` &&
          request.params.get('rev') === 'refs/tags/2026.101.000000',
      )
      .flush({ error: 'no-such-rev' }, { status: 404, statusText: 'Not Found' });
    http
      .expectOne(
        (request) =>
          request.url === `${API}/loc` && request.params.get('rev') === 'refs/tags/2026.101.000000',
      )
      .flush({ error: 'no-such-rev' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(text()).toContain('There is no');
    expect(text()).toContain('2026.101.000000');
    expect(text()).toContain('Go to the default branch');
  });
});
