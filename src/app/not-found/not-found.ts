import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * A URL under `/githost/` that this app does not recognise.
 *
 * It renders a small page and stops there. It deliberately does **not** copy spa-home's behaviour of
 * handing the URL back to the gateway: that is the landing page's job, and it is correct only
 * because spa-home is mounted at the root, where an unknown first segment is another micro
 * frontend. Here the segment is already ours, so there is nobody to hand it to.
 *
 * One caveat for whoever lands here from a `/git/…` address: the git protocol is **not** served
 * under `/githost/`. It is mounted at `/git`, where a repository answers at
 * `/git/<project>/<repository>`, and this service's ignored path prefixes 404 a mistyped machine
 * path on purpose.
 */
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <h1>No such page here</h1>
    <p>
      This is the git host. It shows a repository's contents at
      <code>/&lt;project&gt;/&lt;group&gt;/&lt;repository&gt;</code> — the Code pages — and its own
      storage audit at the root, and nothing else.
    </p>
    <p><a routerLink="/">Back to the orphaned repositories</a></p>
  `,
  styles: `
    h1 {
      font-size: 1.25rem;
      margin: 0 0 0.5rem;
    }
  `,
})
export class NotFound {}
