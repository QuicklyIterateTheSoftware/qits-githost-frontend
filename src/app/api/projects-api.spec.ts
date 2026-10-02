import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { QITS_NAVIGATION, toNavTree, type QitsNavTree } from '@qits/ui-components';
import { ProjectsApi } from './projects-api';

const PROJECTS_ORIGIN = 'https://projects.qits.example';
const REPO_ID = 'r-1';
const SHA = 'a'.repeat(40);

/**
 * Where these reads go. qits-projects answers on its own host — the edge no longer routes its paths
 * on this one — so every read is an absolute URL on the origin the navigation names, carries the
 * session, and is not made at all until the navigation has said where that origin is.
 */
describe('ProjectsApi', () => {
  let tree: WritableSignal<QitsNavTree | undefined>;
  let api: ProjectsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    tree = signal<QitsNavTree | undefined>(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: QITS_NAVIGATION, useValue: { tree, failed: signal(false) } },
      ],
    });
    api = TestBed.inject(ProjectsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function answer(applications?: Record<string, { origin: string }>): void {
    tree.set(toNavTree({ slots: {}, applications }));
    TestBed.tick();
  }

  /** Lets the awaited URL resolve, so a request that is going out has gone out. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }

  it('asks nothing before the navigation says where qits-projects is', async () => {
    void api.catalogue();
    TestBed.tick();
    await settle();
    http.expectNone(() => true);
    answer({ 'qits-projects': { origin: PROJECTS_ORIGIN } });
    await settle();
    http.expectOne(`${PROJECTS_ORIGIN}/projects/api/repositories`).flush({ repositories: [] });
  });

  it('reads the catalogue on qits-projects’ own origin, with the session', async () => {
    answer({ 'qits-projects': { origin: PROJECTS_ORIGIN } });
    const catalogue = api.catalogue();
    await settle();
    const request = http.expectOne(`${PROJECTS_ORIGIN}/projects/api/repositories`);
    expect(request.request.withCredentials).toBe(true);
    request.flush({ repositories: [{ id: REPO_ID }] });
    await expect(catalogue).resolves.toMatchObject([{ id: REPO_ID }]);
  });

  it('reads the log, the changes and a diff there too, with the session', async () => {
    answer({ 'qits-projects': { origin: PROJECTS_ORIGIN } });
    const base = `${PROJECTS_ORIGIN}/projects/api/repositories/${REPO_ID}/commits`;

    void api.commits(REPO_ID, 'main');
    await settle();
    const log = http.expectOne((r) => r.url === base && r.params.get('branch') === 'main');
    expect(log.request.withCredentials).toBe(true);
    log.flush({});

    void api.commitChanges(REPO_ID, SHA);
    await settle();
    const changes = http.expectOne(`${base}/${SHA}/changes`);
    expect(changes.request.withCredentials).toBe(true);
    changes.flush({});

    void api.commitFileDiff(REPO_ID, SHA, 'README.md');
    await settle();
    const diff = http.expectOne(
      (r) => r.url === `${base}/${SHA}/diff` && r.params.get('path') === 'README.md',
    );
    expect(diff.request.withCredentials).toBe(true);
    diff.flush({});
  });

  it('keeps the same-origin path where the navigation names no origin for qits-projects', async () => {
    answer();
    void api.catalogue();
    await settle();
    http.expectOne('/projects/api/repositories').flush({ repositories: [] });
  });
});
