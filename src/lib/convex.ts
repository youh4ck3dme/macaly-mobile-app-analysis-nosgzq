import { preloadQuery as convexPreloadQuery } from "convex/nextjs"
import { FunctionReference, FunctionArgs } from "convex/server"

/**
 * Convex SSR helper for TanStack Start / Vite environments.
 *
 * The `preloadQuery` function from `convex/nextjs` works perfectly with any
 * framework — not just Next.js — as long as you provide the Convex deployment
 * URL. By default it looks for `NEXT_PUBLIC_CONVEX_URL`, which doesn't exist
 * in a Vite/TanStack project. Without it you'll get:
 *
 *   "Environment variable NEXT_PUBLIC_CONVEX_URL is not set."
 *
 * This wrapper automatically passes `VITE_CONVEX_URL` (the standard env var
 * in Vite projects) so you never hit that error. You can also override the
 * URL manually via the `options.url` parameter if needed.
 *
 * ---
 *
 * USE THIS TO PRELOAD DATA ON ALL PUBLIC PAGES.
 *
 * Call `preloadQuery` inside your route's `loader` function to fetch data
 * server-side. The HTML response will contain the actual content (SSR),
 * making it indexable by search engines and instantly visible to users.
 *
 * Without preloading, pages render an empty skeleton on first paint and
 * only fill in data after the client-side Convex subscription connects —
 * bad for SEO and perceived performance.
 *
 * Example:
 *
 *   import { preloadQuery } from "@/lib/convex"
 *   import { usePreloadedQuery, Preloaded } from "convex/react"
 *
 *   export const Route = createFileRoute("/blog")({
 *     loader: async () => {
 *       const preloadedPosts = await preloadQuery(api.posts.list, {})
 *       return { preloadedPosts }
 *     },
 *     component: BlogPage,
 *   })
 *
 *   function BlogPage() {
 *     const { preloadedPosts } = Route.useLoaderData()
 *     const posts = usePreloadedQuery(preloadedPosts as Preloaded<typeof api.posts.list>)
 *     // posts is available immediately — no loading state needed
 *   }
 */
export async function preloadQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args?: FunctionArgs<Query>,
  options?: { url?: string }
) {
  const url = options?.url ?? import.meta.env.VITE_CONVEX_URL
  return convexPreloadQuery(query, args ?? ({} as any), { url })
}
