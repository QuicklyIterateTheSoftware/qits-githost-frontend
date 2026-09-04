# qits-githost-frontend

The git host's browser plane: the Code pages — a repository's committed contents, read straight
from the bare storage — and the storage audit. Served by qits-githost itself at `/` on
`githost.<env>.<domain>` through Quinoa. All of it is read.

- **`/<project>/<category>/<repository>`** and **`…/branches/<ref…>`** — the Code page: file tree
  and file viewer at a rev. The bare form is the default branch and is what the platform's
  per-repository `Code` navigation entries link to; the `branches/` form spells the ref, a slashy
  branch name keeping its slashes as segments. The open file and a painted line range are query
  parameters (`?path=…`, `?lines=12-20`). Three requests — describe, the whole tree in one read,
  and one per opened file.
- **`…/commits[/<ref…>]`** — the branch's log, from qits-projects' mirror: the full history on the
  default branch, and on any other branch only the commits its parent does not have yet. Each row
  opens the commit.
- **`…/commit/<sha>`** — one commit as the same two-pane view scoped to what it changed: the
  touched files on the left, the open file's unified diff (`?path=…`) on the right, plus a jump to
  browse the whole tree as it stood at that commit.
- **`/`** — the orphaned repositories: storage rows whose id qits-projects' catalogue no longer
  names. Two requests, none per row.

**Two planes, one host.** The git protocol answers at `/git/…` and this client is mounted at `/`,
on the same authority every clone url already spells. This client never talks to `/git`: its reads
go to `/githost/api/repositories/…`, the browser plane's own endpoints, which stay open when the
`/git/<id>` storage scheme is locked to qits-projects.

**This is a `repository`-routed app.** The Code pages belong to one repository each, so
`provideQitsScope('repository')` in `app.config.ts` routes `/<slug>/<category>/<repo>/…`, the
chrome's project picker navigates in-app to `/<slug>`, and `QITS_SCOPE.repositoryId()` resolves the
repository name in the address to the storage UUID the browse endpoints key by.

**Only `id` is a promise of the catalogue record.** The service's repository record is expected to
grow — a description, a size — so the audit table draws the id as a column and everything else as
whatever arrived, named the way the wire names it. A field the service adds shows up here
without a release of this repository; a field it drops leaves no blank column behind. A field with
nothing in it is not drawn at all: a label above an empty cell claims the service answered
"nothing" when it answered nothing at all.

**A failed load says so.** "There are no repositories" and "I could not ask" are different facts and
must never share a screen state. A refusal is drawn as an error with the status, the service's own
message and a retry — and no table at all. An empty host gets a sentence.

## Layout

The chrome — top bar, project picker, platform navigation — is `QitsMainLayout` from
`@qits/ui-components`, mounted as the root _route_ component so it survives every navigation beneath
it. The navigation tree comes from the edge's `/main-navigation`, asked once at startup by
`provideQitsNavigation()`; the picker's projects come from `provideQitsProjects()`.

## Development

```bash
npm install       # resolves @qits/* from the platform registry - see .npmrc
npm start         # ng serve on :4200; /githost/api, /projects/api and /main-navigation
                  # proxied to the edge on :8080
npm run lint
npm test          # vitest on jsdom
npm run build     # dist/qits-spa-githost/browser, base href /
```

`.npmrc` points npm at the two local platform registries: npmjs through qits-platform-mirror's
pull-through cache on mirror.dev.localhost:8080, the `@qits` scope from qits-artifacts on
registry.dev.localhost:8080. Both are edge vhosts the deployment host publishes, so they work for a
developer on that host and nowhere else — CI passes the in-network addresses through the environment
instead.

Angular stays on **21.2**, deliberately not 22: Angular CLI 22 requires node `^22.22.3`, and the
platform's node is 22.22.0. Quinoa shells out to the host's node during `mvn package`, so this
client must stay on an Angular the platform node can run.

## How it ships

This repository builds no image. qits-githost-service carries it as a git submodule at
`service/src/main/webui`, and Quinoa builds `dist/qits-spa-githost/browser` into the service image
during `mvn package`. The one pipeline here (`.config/qits/ci-event-release-request.yml`) runs
install, lint, test, build for a release request, on the folded `release/<id>` branch, and its
verdict gates the release — nothing builds on a push. qits-githost-service's own pipeline is where
the bundle becomes deployable.
