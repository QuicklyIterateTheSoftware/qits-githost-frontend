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
import type { CommitDto } from '../api/dto';

const REPO_ID = '3f6c1a9e-0b25-4d1e-9c77-2a0e5b8f4d31';
const GITHOST = `/githost/api/repositories/${REPO_ID}`;
const PROJECTS = `/projects/api/repositories/${REPO_ID}`;

function commit(hash: string, message: string): CommitDto {
  return {
    hash: hash.repeat(40).slice(0, 40),
    shortHash: hash.repeat(10).slice(0, 10),
    author: 'qits',
    email: 'qits@local',
    date: '2026-08-25T14:00:00+00:00',
    message,
    files: ['README.md'],
  };
}

/**
 * The commits view through the real route table. The list's meaning — everything on main, only the
 * unmerged commits elsewhere — is asserted off the answer's own `parent` field, because the page
 * must SAY what the service computed rather than re-deriving the rule.
 */
describe('CommitsPage', () => {
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
    http.expectOne(GITHOST).flush({ id: REPO_ID, defaultBranch: 'main', branches });
  }

  it('shows the full history on the default branch, and says that is what it is', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/commits');
    await settle();
    flushDescribe(['main']);
    await settle();
    // The bare form redirected to the spelled default branch.
    expect(TestBed.inject(Router).url).toContain('/qits/services/qits-ci/commits/main');
    http
      .expectOne(
        (request) =>
          request.url === `${PROJECTS}/commits` && request.params.get('branch') === 'main',
      )
      .flush({ branch: 'main', parent: null, commits: [commit('a', 'first'), commit('b', 'second')] });
    await settle();

    expect(text()).toContain('The full history of main — 2 commits.');
    expect(text()).toContain('first');
    expect(text()).toContain('second');
  });

  it('shows the unmerged commits on any other branch, off the answer, slashes intact', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/commits/feature/slashy');
    await settle();
    flushDescribe(['feature/slashy', 'main']);
    await settle();
    http
      .expectOne(
        (request) =>
          request.url === `${PROJECTS}/commits` &&
          request.params.get('branch') === 'feature/slashy',
      )
      .flush({ branch: 'feature/slashy', parent: 'main', commits: [commit('c', 'unmerged work')] });
    await settle();

    expect(text()).toContain('1 commit on feature/slashy not yet merged to main.');
    expect(text()).toContain('unmerged work');
  });

  it('opens a commit at its own address, remembering the branch it came from', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/commits');
    await settle();
    flushDescribe(['main']);
    await settle();
    http
      .expectOne((request) => request.url === `${PROJECTS}/commits`)
      .flush({ branch: 'main', parent: null, commits: [commit('a', 'first')] });
    await settle();

    (page().querySelector('.commit') as HTMLButtonElement).click();
    await settle();

    const url = TestBed.inject(Router).url;
    expect(url).toContain('/qits/services/qits-ci/commit/' + 'a'.repeat(40));
    expect(url).toContain('branch=main');
    // The commit page's own read.
    http
      .expectOne(`${PROJECTS}/commits/${'a'.repeat(40)}/changes`)
      .flush({ commit: 'a'.repeat(40), parent: null, files: [] });
  });

  it('says a fully merged branch has nothing to show', async () => {
    harness = await RouterTestingHarness.create('/qits/services/qits-ci/commits/quiet');
    await settle();
    flushDescribe(['main', 'quiet']);
    await settle();
    http
      .expectOne((request) => request.url === `${PROJECTS}/commits`)
      .flush({ branch: 'quiet', parent: 'main', commits: [] });
    await settle();

    expect(text()).toContain('already on its parent');
  });
});
