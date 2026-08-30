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
const SHA = 'd'.repeat(40);
const PROJECTS = `/projects/api/repositories/${REPO_ID}`;

/**
 * The commit view: the change set as the left pane, the open file's unified diff as the right —
 * the tree view's shape, scoped to one commit.
 */
describe('CommitPage', () => {
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

  function flushChanges(): void {
    http.expectOne(`${PROJECTS}/commits/${SHA}/changes`).flush({
      commit: SHA,
      parent: 'e'.repeat(40),
      files: [
        { path: 'src/app/main.ts', oldPath: null, changeType: 'MODIFIED' },
        { path: 'docs/new.md', oldPath: null, changeType: 'ADDED' },
      ],
    });
  }

  it('lists what the commit changed and says what it was diffed against', async () => {
    harness = await RouterTestingHarness.create(`/qits/services/qits-ci/commit/${SHA}`);
    await settle();
    flushChanges();
    await settle();

    expect(text()).toContain('dddddddddd');
    expect(text()).toContain('2 files changed against eeeeeeeeee.');
    expect(text()).toContain('src/app/main.ts');
    expect(text()).toContain('docs/new.md');
    expect(text()).toContain('Select a changed file to view its diff.');
  });

  it('opens a file as ?path= and renders its unified diff, classed by line', async () => {
    harness = await RouterTestingHarness.create(
      `/qits/services/qits-ci/commit/${SHA}?path=src/app/main.ts`,
    );
    await settle();
    flushChanges();
    await settle();
    http
      .expectOne(
        (request) =>
          request.url === `${PROJECTS}/commits/${SHA}/diff` &&
          request.params.get('path') === 'src/app/main.ts',
      )
      .flush({
        path: 'src/app/main.ts',
        changeType: 'MODIFIED',
        diff: '--- a/src/app/main.ts\n+++ b/src/app/main.ts\n@@ -1,2 +1,2 @@\n-old line\n+new line\n context\n',
      });
    await settle();

    expect(page().querySelector('.line.add')?.textContent).toContain('+new line');
    expect(page().querySelector('.line.del')?.textContent).toContain('-old line');
    expect(page().querySelector('.line.hunk')?.textContent).toContain('@@');
  });

  it('says an empty patch is a binary change or a pure rename, not a blank pane', async () => {
    harness = await RouterTestingHarness.create(
      `/qits/services/qits-ci/commit/${SHA}?path=docs/new.md`,
    );
    await settle();
    flushChanges();
    await settle();
    http
      .expectOne((request) => request.url === `${PROJECTS}/commits/${SHA}/diff`)
      .flush({ path: 'docs/new.md', changeType: 'ADDED', diff: '' });
    await settle();

    expect(text()).toContain('No textual change to show');
  });

  it('goes back to the log it came from, and can browse the tree at the commit', async () => {
    harness = await RouterTestingHarness.create(
      `/qits/services/qits-ci/commit/${SHA}?branch=feature/slashy`,
    );
    await settle();
    flushChanges();
    await settle();

    const buttons = [...page().querySelectorAll('.view-switch')] as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Commits'))?.click();
    await settle();
    expect(TestBed.inject(Router).url).toContain(
      '/qits/services/qits-ci/commits/feature/slashy',
    );
    // The commits page the navigation landed on makes its own reads; drain them.
    http
      .expectOne(`/githost/api/repositories/${REPO_ID}`)
      .flush({ id: REPO_ID, defaultBranch: 'main', branches: ['feature/slashy', 'main'] });
    await settle();
    http
      .expectOne((request) => request.url === `${PROJECTS}/commits`)
      .flush({ branch: 'feature/slashy', parent: 'main', commits: [] });
  });

  /** Both ways out of a commit keep the middle segment they arrived on — here the component. */
  it('browses the tree at the commit without losing the component segment', async () => {
    harness = await RouterTestingHarness.create(`/qits/qits-ci/qits-ci/commit/${SHA}`);
    await settle();
    flushChanges();
    await settle();

    expect(text()).toContain('2 files changed against eeeeeeeeee.');

    const buttons = [...page().querySelectorAll('.view-switch')] as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Browse this commit'))?.click();
    await settle();
    expect(TestBed.inject(Router).url).toContain(`/qits/qits-ci/qits-ci/branches/${SHA}`);
    // The tree page the navigation landed on makes its own reads; drain them.
    http
      .expectOne(`/githost/api/repositories/${REPO_ID}`)
      .flush({ id: REPO_ID, defaultBranch: 'main', branches: ['main'] });
    await settle();
    http
      .expectOne((request) => request.url === `/githost/api/repositories/${REPO_ID}/tree`)
      .flush({ rev: SHA, commitSha: SHA, paths: ['README.md'] });
    http
      .expectOne((request) => request.url === `/githost/api/repositories/${REPO_ID}/loc`)
      .flush({ commitSha: SHA, languages: [] });
  });
});
