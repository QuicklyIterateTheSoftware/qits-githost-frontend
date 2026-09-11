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
 *
 * Both panes are `@qits/ui-components` now, so what is tested here is what this page is
 * responsible for: the change set it hands the tree, the patch it reads for the open file, and the
 * `?path=` routing a selection turns into. How a row or a diff line is drawn is the library's own
 * test — the DOM is asserted only as proof the hand-over happened.
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

  /** The row a path is drawn as — a file or a folded directory, both keyed by `data-path`. */
  function row(path: string): HTMLButtonElement | null {
    return page().querySelector(`.qits-change-tree-entry[data-path="${path}"]`);
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
    expect(row('src/app/main.ts')).not.toBeNull();
    expect(row('docs/new.md')).not.toBeNull();
    // The single-child chain folds: one row reads the whole address it stands for.
    expect(row('src/app')?.textContent).toContain('src/app');
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

  /** A click on a row is a navigation: the page turns the tree's selection into `?path=`. */
  it('routes a click on a file row to ?path= and reads the patch of that file', async () => {
    harness = await RouterTestingHarness.create(`/qits/services/qits-ci/commit/${SHA}`);
    await settle();
    flushChanges();
    await settle();

    row('docs/new.md')?.click();
    await settle();

    expect(TestBed.inject(Router).url).toContain('path=docs%2Fnew.md');
    http
      .expectOne(
        (request) =>
          request.url === `${PROJECTS}/commits/${SHA}/diff` &&
          request.params.get('path') === 'docs/new.md',
      )
      .flush({ path: 'docs/new.md', changeType: 'ADDED', diff: '@@ -0,0 +1 @@\n+hello\n' });
    await settle();

    expect(page().querySelector('.line.add')?.textContent).toContain('+hello');
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

    expect(text()).toContain(
      'No textual change to show — a binary file, a pure rename, or a patch too large to send.',
    );
  });

  /**
   * The old flat list drew every change as the same grey letter. Three kinds of change now read as
   * three different marks, and a rename says where the file came from — the fact its empty patch
   * cannot state for itself.
   */
  it('draws an add, a delete and a rename distinguishably', async () => {
    harness = await RouterTestingHarness.create(`/qits/services/qits-ci/commit/${SHA}`);
    await settle();
    http.expectOne(`${PROJECTS}/commits/${SHA}/changes`).flush({
      commit: SHA,
      parent: 'e'.repeat(40),
      files: [
        { path: 'docs/new.md', oldPath: null, changeType: 'ADDED' },
        { path: 'docs/gone.md', oldPath: null, changeType: 'DELETED' },
        { path: 'docs/moved.md', oldPath: 'docs/was.md', changeType: 'RENAMED' },
      ],
    });
    await settle();

    const marks = [...page().querySelectorAll('.qits-change-tree-mark')] as HTMLElement[];
    const letters = new Map(
      marks.map((mark) => [mark.dataset['change'] ?? '', mark.textContent?.trim() ?? '']),
    );

    expect(letters.get('ADDED')).toBe('A');
    expect(letters.get('DELETED')).toBe('D');
    expect(letters.get('RENAMED')).toBe('R');
    expect(new Set(letters.values()).size).toBe(3);

    expect(row('docs/moved.md')?.getAttribute('title')).toContain('docs/was.md');
  });

  /**
   * The tree owns its own expansion and the page owns the address. Folding a directory shut is the
   * tree's business alone: the reader keeps the file they were reading, and no read is made.
   */
  it('folds a directory shut without changing ?path=', async () => {
    harness = await RouterTestingHarness.create(
      `/qits/services/qits-ci/commit/${SHA}?path=docs/new.md`,
    );
    await settle();
    flushChanges();
    await settle();
    http
      .expectOne((request) => request.url === `${PROJECTS}/commits/${SHA}/diff`)
      .flush({ path: 'docs/new.md', changeType: 'ADDED', diff: '@@ -0,0 +1 @@\n+hello\n' });
    await settle();

    const before = TestBed.inject(Router).url;
    expect(row('src/app/main.ts')).not.toBeNull();

    row('src/app')?.click();
    await settle();

    expect(row('src/app/main.ts')).toBeNull();
    expect(TestBed.inject(Router).url).toBe(before);
    expect(page().querySelector('.line.add')?.textContent).toContain('+hello');
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
    expect(TestBed.inject(Router).url).toContain('/qits/services/qits-ci/commits/feature/slashy');
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
    http.expectOne(`/githost/api/repositories/${REPO_ID}/tags`).flush({ id: REPO_ID, tags: [] });
    await settle();
    http
      .expectOne((request) => request.url === `/githost/api/repositories/${REPO_ID}/tree`)
      .flush({ rev: SHA, commitSha: SHA, paths: ['README.md'] });
    http
      .expectOne((request) => request.url === `/githost/api/repositories/${REPO_ID}/loc`)
      .flush({ commitSha: SHA, languages: [] });
  });
});
