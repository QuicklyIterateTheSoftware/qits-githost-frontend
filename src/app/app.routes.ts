import type { Routes } from '@angular/router';
import { QitsMainLayout } from '@qits/ui-components';
import { NotFound } from './not-found/not-found';
import { RepositoriesPage } from './repositories/repositories-page';

/**
 * One view, inside the platform chrome.
 *
 * `QitsMainLayout` is the root *route* component rather than something the shell templates, so the
 * bar and the navigation mount once and survive every navigation beneath them.
 *
 * **The address starts at the root**, because this application is served at `/` on its own host. It
 * is a `system` app: the git host serves every project rather than belonging to one, so it has no
 * `/<slug>/...` form and adds none — picking a project in the chrome leaves for qits-projects
 * instead.
 *
 * The `**` route sits inside the layout too: this host is this application's outright, so an unknown
 * URL on it is an ordinary 404 and is drawn with the chrome around it.
 */
export const routes: Routes = [
  {
    path: '',
    component: QitsMainLayout,
    children: [
      { path: '', component: RepositoriesPage },
      { path: '**', component: NotFound },
    ],
  },
];
