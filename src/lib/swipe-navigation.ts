/** Pure helpers for edge swipe history navigation. */

export const EDGE_ZONE_PX = 28
export const MIN_THRESHOLD_PX = 60
export const MAX_THRESHOLD_PX = 80
export const VIEWPORT_THRESHOLD_RATIO = 0.2
/** Horizontal must dominate vertical by this ratio once direction locks. */
export const HORIZONTAL_DOMINANCE = 1.15

export type SwipeNavDirection = "back" | "forward"

export type SwipeIntent = SwipeNavDirection | null

export function getSwipeThreshold(viewportWidth: number): number {
  const fromViewport = viewportWidth * VIEWPORT_THRESHOLD_RATIO
  return Math.min(MAX_THRESHOLD_PX, Math.max(MIN_THRESHOLD_PX, fromViewport))
}

/**
 * Back = start near left edge; forward = start near right edge.
 */
export function isEdgeSwipeStart(
  clientX: number,
  viewportWidth: number,
  direction: SwipeNavDirection,
  edgeZonePx: number = EDGE_ZONE_PX,
): boolean {
  if (direction === "back") {
    return clientX <= edgeZonePx
  }
  return clientX >= viewportWidth - edgeZonePx
}

/**
 * Infer candidate direction from where the gesture started (before Δx is known).
 */
export function edgeDirectionFromStart(
  clientX: number,
  viewportWidth: number,
  edgeZonePx: number = EDGE_ZONE_PX,
): SwipeNavDirection | null {
  if (clientX <= edgeZonePx) return "back"
  if (clientX >= viewportWidth - edgeZonePx) return "forward"
  return null
}

/**
 * Resolve whether a completed gesture should navigate.
 * Back: finger moves left→right (positive Δx).
 * Forward: finger moves right→left (negative Δx).
 */
export function resolveSwipeIntent(opts: {
  dx: number
  dy: number
  threshold: number
  edgeDirection: SwipeNavDirection
  dominance?: number
}): SwipeIntent {
  const { dx, dy, threshold, edgeDirection } = opts
  const dominance = opts.dominance ?? HORIZONTAL_DOMINANCE
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)

  if (absX < threshold) return null
  if (absX < absY * dominance) return null

  if (edgeDirection === "back" && dx > 0) return "back"
  if (edgeDirection === "forward" && dx < 0) return "forward"
  return null
}

/**
 * Progress 0..1 for visual feedback (clamped), signed by navigation direction.
 */
export function swipeProgress(dx: number, threshold: number, edgeDirection: SwipeNavDirection): number {
  if (threshold <= 0) return 0
  if (edgeDirection === "back") {
    return Math.max(0, Math.min(1, dx / threshold))
  }
  return Math.max(0, Math.min(1, -dx / threshold))
}

function overflowAllowsHorizontalScroll(overflowX: string): boolean {
  return (
    overflowX === "auto" ||
    overflowX === "scroll" ||
    overflowX === "overlay" ||
    overflowX === "hidden"
  )
}

/**
 * True when an element (or its ancestors) owns horizontal scrolling / carousel / tabs.
 * Navigation swipe yields priority to those controls.
 */
export function shouldIgnoreSwipeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false

  let el: Element | null = target
  while (el && el !== document.documentElement) {
    if (el instanceof HTMLElement) {
      if (el.dataset.swipeNavIgnore != null) return true

      const slot = el.dataset.slot
      if (slot === "carousel" || slot === "tabs-list" || slot === "scroll-area") {
        return true
      }

      const role = el.getAttribute("role")
      const roledescription = el.getAttribute("aria-roledescription")
      if (roledescription === "carousel") return true
      if (role === "tablist") return true

      const style = window.getComputedStyle(el)
      if (overflowAllowsHorizontalScroll(style.overflowX)) {
        if (el.scrollWidth > el.clientWidth + 1) return true
      }
    }
    el = el.parentElement
  }

  return false
}

export function canNavigate(
  intent: SwipeIntent,
  opts: { canGoBack: boolean; canGoForward: boolean },
): boolean {
  if (intent === "back") return opts.canGoBack
  if (intent === "forward") return opts.canGoForward
  return false
}

/** Track forward-stack availability using TanStack `__TSR_index`. */
export function createHistoryIndexTracker() {
  let maxIndex = 0

  return {
    sync(currentIndex: number, actionType?: string) {
      const idx = Number.isFinite(currentIndex) ? currentIndex : 0
      // PUSH truncates the browser forward stack — reset the ceiling.
      if (actionType === "PUSH") {
        maxIndex = idx
        return
      }
      if (idx > maxIndex) maxIndex = idx
    },
    canGoForward(currentIndex: number) {
      const idx = Number.isFinite(currentIndex) ? currentIndex : 0
      return idx < maxIndex
    },
    getMaxIndex() {
      return maxIndex
    },
    reset() {
      maxIndex = 0
    },
  }
}

export function readHistoryIndex(state: { __TSR_index?: number } | null | undefined): number {
  const idx = state?.__TSR_index
  return typeof idx === "number" && Number.isFinite(idx) ? idx : 0
}
