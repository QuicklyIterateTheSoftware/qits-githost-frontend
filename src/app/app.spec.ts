import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsNavigationLinks } from '@qits/ui-components';
import { App } from './app';
import { routes } from './app.routes';

/**
 * A fixture navigation, not the platform's. `provideQitsNavigationLinks` answers the layout's
 * `QITS_NAVIGATION` from a literal, so the chrome makes no `/main-navigation` request — which is
 * what keeps `http.verify()` honest instead of failing on a call this file never asked for.
 */
const NAV = [
  { label: 'CI', href: '/ci/' },
  { label: 'Git host', href: '/githost/' },
] as const;

/** The shell owns one thing — the outlet — so that is what is asserted, plus the route table
 * reaching the shared layout through it and the page sitting inside that layout. */
describe('App', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideQitsNavigationLinks(NAV),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('is an outlet and nothing else', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const shell = fixture.nativeElement as HTMLElement;
    expect(shell.querySelector('router-outlet')).not.toBeNull();
    expect(shell.children).toHaveLength(1);
  });

  it('routes the base path to the shared layout, with the storage audit inside it', async () => {
    const harness = await RouterTestingHarness.create('/');
    const layout = harness.routeNativeElement as HTMLElement;

    expect(layout.tagName.toLowerCase()).toBe('qits-main-layout');
    expect(layout.querySelectorAll('nav a')).toHaveLength(NAV.length);
    expect(layout.querySelector('main app-orphaned-repositories-page')).not.toBeNull();

    // The audit's two reads, drained so the harness has no dangling request.
    http.expectOne('/githost/api/repositories').flush({ repositories: [] });
    http.expectOne('/projects/api/repositories').flush({ repositories: [] });
  });

  it('draws an unknown URL as a page, still inside the chrome', async () => {
    // Two segments with no category in the middle: a SINGLE unknown segment is the `:project`
    // form now and draws the audit page unscoped, the same grammar every scoped sibling SPA has.
    const harness = await RouterTestingHarness.create('/nothing/here');
    const layout = harness.routeNativeElement as HTMLElement;

    expect(layout.tagName.toLowerCase()).toBe('qits-main-layout');
    expect(layout.querySelector('main app-not-found')).not.toBeNull();
    http.verify();
  });
});
