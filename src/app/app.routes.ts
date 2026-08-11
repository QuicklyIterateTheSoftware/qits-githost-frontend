import type { Routes } from '@angular/router';
import { QitsMainLayout } from '@qits/ui-components';
import { NotFound } from './not-found/not-found';
import { RepositoriesPage } from './repositories/repositories-page';

/**
 * One view, inside the platform chrome.
 *
 * `QitsMainLayout` is the root *route* component rather than something the shell templates, so the
 * bar and the navigation mount once and survive every navigation beneath them. The `**` route sits
 * inside the layout too: `/githost/` is a segment this application owns outright, so an unknown URL
 * under it is an ordinary 404 and is drawn with the chrome around it.
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
