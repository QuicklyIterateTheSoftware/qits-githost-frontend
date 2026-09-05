import { provideLocationMocks } from '@angular/common/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';
import { CodePage } from './code/code-page';
import { CommitPage } from './code/commit-page';
import { CommitsPage } from './code/commits-page';
import { NotFound } from './not-found/not-found';
import { OrphanedRepositoriesPage } from './repositories/orphaned-repositories-page';

/**
 * What each address resolves to, and above all that a repository is addressable in BOTH middle
 * spellings — the component the wrapper groups it by, and the archetype category it had before
 * there were components. A link written either way lands on the same page.
 *
 * <p>Components are never created here. Without a `RouterOutlet` the router resolves the state and
 * stops, so this reads the resolved class without booting the chrome or any of its reads.
 */
describe('app routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter(routes), provideLocationMocks()],
    });
  });

  async function resolve(url: string): Promise<unknown> {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    let node = router.routerState.snapshot.root;
    while (node.firstChild) node = node.firstChild;
    return node.component;
  }

  it('serves the host own catalogue at the root and under a project', async () => {
    expect(await resolve('/')).toBe(OrphanedRepositoriesPage);
    // Where the chrome's project picker sends this app when a reader picks `qits`.
    expect(await resolve('/qits')).toBe(OrphanedRepositoriesPage);
  });

  it('serves the tree in the archetype form and in the component form', async () => {
    expect(await resolve('/qits/services/qits-githost')).toBe(CodePage);
    expect(await resolve('/qits/qits-githost/qits-githost-service')).toBe(CodePage);
  });

  /** A tag is a rev like a branch, and calver's dots are nothing to a segment. */
  it('serves the tree at a tag in both middle spellings', async () => {
    expect(await resolve('/qits/services/qits-githost/tags/2026.903.113443')).toBe(CodePage);
    expect(await resolve('/qits/qits-githost/qits-githost-service/tags/2026.903.113443')).toBe(
      CodePage,
    );
  });

  it('serves the other repository views in the component form too', async () => {
    expect(await resolve('/qits/qits-githost/qits-githost-service/branches/feature/x')).toBe(
      CodePage,
    );
    expect(await resolve('/qits/qits-githost/qits-githost-service/commits')).toBe(CommitsPage);
    expect(await resolve('/qits/qits-githost/qits-githost-service/commit/abc123')).toBe(CommitPage);
    expect(await resolve('/qits/services/qits-githost/commit/abc123')).toBe(CommitPage);
  });

  /** A component name is an open set, so the middle segment is read as one and the page settles. */
  it('reads an unknown middle segment as a group rather than turning it away', async () => {
    expect(await resolve('/qits/whatever/qits-githost')).toBe(CodePage);
  });

  it('answers 404 for an address that names no view of a repository', async () => {
    expect(await resolve('/qits/services')).toBe(NotFound);
    expect(await resolve('/qits/qits-githost/qits-githost-service/nonsense')).toBe(NotFound);
  });
});
