import { useSwipeNavigation, type SwipeNavigationVisualState } from "@/hooks/use-swipe-navigation"
import { cn } from "@/lib/utils"

/**
 * Mount once near the app shell. Adds edge-swipe back/forward via TanStack Router history
 * plus a lightweight drag preview. Does not replace UI back controls.
 */
export function SwipeNavigationProvider({ children }: { children: React.ReactNode }) {
  const visual = useSwipeNavigation()

  return (
    <>
      {children}
      <SwipeNavigationFeedback visual={visual} />
    </>
  )
}

function SwipeNavigationFeedback({ visual }: { visual: SwipeNavigationVisualState }) {
  if (!visual.active || !visual.direction) return null

  const isBack = visual.direction === "back"
  const translate = (isBack ? 1 : -1) * visual.progress * 28
  const shadowOpacity = 0.12 + visual.progress * 0.28

  return (
    <div
      aria-hidden
      data-testid="swipe-nav-feedback"
      data-direction={visual.direction}
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
    >
      <div
        className={cn(
          "absolute inset-y-0 w-10",
          isBack ? "left-0" : "right-0",
          visual.releasing ? "transition-opacity duration-150" : "",
        )}
        style={{
          opacity: visual.progress,
          background: isBack
            ? `linear-gradient(90deg, hsl(var(--foreground) / ${shadowOpacity}), transparent)`
            : `linear-gradient(270deg, hsl(var(--foreground) / ${shadowOpacity}), transparent)`,
        }}
      />
      <div
        className={cn(
          "absolute inset-y-8 w-1.5 rounded-full bg-primary/70",
          isBack ? "left-1" : "right-1",
          visual.releasing ? "transition-all duration-150 ease-out" : "",
        )}
        style={{
          opacity: 0.35 + visual.progress * 0.65,
          transform: `translateX(${translate}px) scaleY(${0.55 + visual.progress * 0.45})`,
        }}
      />
    </div>
  )
}
