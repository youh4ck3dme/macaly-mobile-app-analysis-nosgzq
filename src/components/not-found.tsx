import { Link } from '@tanstack/react-router'

// Wired as router-level `defaultNotFoundComponent` (see ../router.tsx) so it
// catches both unmatched URLs and `throw notFound()` from loaders/beforeLoad.
//
// Do NOT call `Route.useLoaderData()` here — the loader may not have completed
// when the not-found boundary renders. Safe hooks: `useParams`, `useSearch`,
// `useRouteContext`. To forward partial data, throw `notFound({ data: ... })`
// and read it from the `data` prop (typed as `unknown` — validate before use).
export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 p-6 text-center">
      <h1 className="text-4xl font-semibold">404</h1>
      <p className="text-muted-foreground">Page not found.</p>
      <Link
        to="/"
        className="text-sm underline underline-offset-4 hover:no-underline"
      >
        Go home
      </Link>
    </div>
  )
}
