# qits-spa-githost

The git host's catalogue: the repositories qits-githost serves, and the address to clone each of
them from. Served by qits-githost itself at `/githost/` through Quinoa. One page, and all of it is
read.

- **`/githost/`** — every repository, its id, its clone address, and whatever else the service says
  about it. One request, and none per repository.

**Two segments, one host.** The git protocol answers at `/git/…` and this client is mounted at
`/githost/`. So a clone address is `/git/<id>` — spelled relative, because it is correct for
whichever host the reader reached the page on and the platform has more than one. This page is the
catalogue only; it never talks to `/git`.

**Only `id` is a promise.** The service's repository record is expected to grow — a default branch,
a description, a size — so the table draws the id and the clone address as columns and everything
else as whatever arrived, named the way the wire names it. A field the service adds shows up here
without a release of this repository; a field it drops leaves no blank column behind. A field with
nothing in it is not drawn at all: a label above an empty cell claims the service answered
"nothing" when it answered nothing at all.

**A failed load says so.** "There are no repositories" and "I could not ask" are different facts and
must never share a screen state. A refusal is drawn as an error with the status, the service's own
message and a retry — and no table at all. An empty host gets a sentence.

## Layout

The chrome — top bar, platform navigation — is `QitsMainLayout` from `@qits/ui-components`, mounted
as the root _route_ component so it survives every navigation beneath it. The navigation's links
come from the gateway's `/main-navigation`, asked once at startup by `provideQitsNavigation()`.

## Development

```bash
npm install       # resolves @qits/* from the platform registry - see .npmrc
npm start         # ng serve on :4200, /githost/api proxied to the gateway on :8080
npm run lint
npm test          # vitest on jsdom
npm run build     # dist/qits-spa-githost/browser, base href /githost/
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

This repository builds no image. qits-githost carries it as a git submodule at
`service/src/main/webui`, and Quinoa builds `dist/qits-spa-githost/browser` into the service image
during `mvn package`. The pipeline here (`.config/qits/ci-post-receive.yml`) keeps `main` green —
install, lint, test, build — and qits-githost's own pipeline is where the bundle becomes deployable.
