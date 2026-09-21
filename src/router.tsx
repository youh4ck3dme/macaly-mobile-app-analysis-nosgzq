import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { NotFound } from './components/not-found'
import { ErrorBoundary } from './components/error-boundary'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Router-wide fallbacks. Individual routes can still override with their
    // own `notFoundComponent` / `errorComponent`.
    //
    // `notFoundMode` is left at its default ('fuzzy'): the router walks up to
    // the nearest parent route that has children AND a `notFoundComponent`,
    // preserving as much surrounding layout as possible. Set to 'root' if you
    // want every not-found to land on the root component instead.
    //
    // Heads-up: leaf routes (no children, no <Outlet />) cannot catch
    // path-based not-founds — the error bubbles to the nearest parent with
    // children. A `notFoundComponent` on a leaf route only fires for
    // `throw notFound()` raised inside THAT route's own loader/beforeLoad.
    //
    // Do NOT add a `notFoundRoute` option here. The deprecated `NotFoundRoute`
    // silently disables `notFound()` and every `notFoundComponent` in the app.
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: ErrorBoundary,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
