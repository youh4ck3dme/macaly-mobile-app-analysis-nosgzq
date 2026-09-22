import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import {
  EDGE_ZONE_PX,
  canNavigate,
  createHistoryIndexTracker,
  edgeDirectionFromStart,
  getSwipeThreshold,
  readHistoryIndex,
  resolveSwipeIntent,
  shouldIgnoreSwipeTarget,
  swipeProgress,
  type SwipeNavDirection,
} from "@/lib/swipe-navigation"

export type SwipeNavigationVisualState = {
  active: boolean
  direction: SwipeNavDirection | null
  /** 0..1 during drag; snaps during release animation */
  progress: number
  releasing: boolean
}

const INITIAL_VISUAL: SwipeNavigationVisualState = {
  active: false,
  direction: null,
  progress: 0,
  releasing: false,
}

type GestureState = {
  pointerId: number
  startX: number
  startY: number
  edgeDirection: SwipeNavDirection
  ignored: boolean
  tracking: boolean
}

/**
 * Module-level tracker survives provider remounts between routes so forward
 * history stays available after an edge-swipe back.
 */
const historyIndexTracker = createHistoryIndexTracker()

/** Test-only: clear forward-stack ceiling between cases. */
export function resetSwipeNavigationTrackerForTests() {
  historyIndexTracker.reset()
}

/**
 * Edge-swipe history navigation for touch / optional pointer.
 * Attaches window listeners; call from a single root provider.
 */
export function useSwipeNavigation(): SwipeNavigationVisualState {
  const router = useRouter()
  const [visual, setVisual] = useState<SwipeNavigationVisualState>(INITIAL_VISUAL)
  const gestureRef = useRef<GestureState | null>(null)
  const releasingTimerRef = useRef<number | null>(null)

  const syncTracker = useCallback(
    (actionType?: string) => {
      const idx = readHistoryIndex(router.history.location.state)
      historyIndexTracker.sync(idx, actionType)
    },
    [router],
  )

  useEffect(() => {
    syncTracker()
    return router.history.subscribe(({ action }) => {
      syncTracker(action.type)
    })
  }, [router, syncTracker])

  useEffect(() => {
    return () => {
      if (releasingTimerRef.current != null) {
        window.clearTimeout(releasingTimerRef.current)
      }
    }
  }, [])

  const navigateIfPossible = useCallback(
    (direction: SwipeNavDirection) => {
      const canGoBack = router.history.canGoBack()
      const canGoForward = historyIndexTracker.canGoForward(
        readHistoryIndex(router.history.location.state),
      )
      if (!canNavigate(direction, { canGoBack, canGoForward })) return false
      if (direction === "back") {
        router.history.back()
      } else {
        router.history.forward()
      }
      return true
    },
    [router],
  )

  const finishGesture = useCallback(
    (clientX: number, clientY: number) => {
      const gesture = gestureRef.current
      gestureRef.current = null
      if (!gesture || gesture.ignored || !gesture.tracking) {
        setVisual(INITIAL_VISUAL)
        return
      }

      const dx = clientX - gesture.startX
      const dy = clientY - gesture.startY
      const threshold = getSwipeThreshold(window.innerWidth)
      const intent = resolveSwipeIntent({
        dx,
        dy,
        threshold,
        edgeDirection: gesture.edgeDirection,
      })

      const canGoBack = router.history.canGoBack()
      const canGoForward = historyIndexTracker.canGoForward(
        readHistoryIndex(router.history.location.state),
      )
      const shouldNav = canNavigate(intent, { canGoBack, canGoForward })

      if (shouldNav && intent) {
        setVisual({
          active: true,
          direction: intent,
          progress: 1,
          releasing: true,
        })
        if (releasingTimerRef.current != null) {
          window.clearTimeout(releasingTimerRef.current)
        }
        releasingTimerRef.current = window.setTimeout(() => {
          navigateIfPossible(intent)
          setVisual(INITIAL_VISUAL)
          releasingTimerRef.current = null
        }, 140)
      } else {
        setVisual({
          active: true,
          direction: gesture.edgeDirection,
          progress: 0,
          releasing: true,
        })
        if (releasingTimerRef.current != null) {
          window.clearTimeout(releasingTimerRef.current)
        }
        releasingTimerRef.current = window.setTimeout(() => {
          setVisual(INITIAL_VISUAL)
          releasingTimerRef.current = null
        }, 120)
      }
    },
    [navigateIfPossible, router],
  )

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      // Touch is primary; mouse/pen allowed from edges without preventing selection.
      if (event.pointerType === "mouse" && event.button !== 0) return

      const edgeDirection = edgeDirectionFromStart(
        event.clientX,
        window.innerWidth,
        EDGE_ZONE_PX,
      )
      if (!edgeDirection) return

      if (shouldIgnoreSwipeTarget(event.target)) {
        gestureRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          edgeDirection,
          ignored: true,
          tracking: false,
        }
        return
      }

      // Only start back/forward if history allows that direction.
      const canGoBack = router.history.canGoBack()
      const canGoForward = historyIndexTracker.canGoForward(
        readHistoryIndex(router.history.location.state),
      )
      if (edgeDirection === "back" && !canGoBack) return
      if (edgeDirection === "forward" && !canGoForward) return

      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        edgeDirection,
        ignored: false,
        tracking: true,
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      if (gesture.ignored || !gesture.tracking) return

      const dx = event.clientX - gesture.startX
      const dy = event.clientY - gesture.startY
      const absX = Math.abs(dx)
      const absY = Math.abs(dy)

      // Abort if vertical scroll clearly dominates early on.
      if (absY > 24 && absY > absX * 1.15) {
        gesture.tracking = false
        setVisual(INITIAL_VISUAL)
        return
      }

      const threshold = getSwipeThreshold(window.innerWidth)
      const progress = swipeProgress(dx, threshold, gesture.edgeDirection)
      if (progress <= 0 && absX < 8) return

      setVisual({
        active: true,
        direction: gesture.edgeDirection,
        progress,
        releasing: false,
      })
    }

    const onPointerUp = (event: PointerEvent) => {
      const gesture = gestureRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      finishGesture(event.clientX, event.clientY)
    }

    const onPointerCancel = (event: PointerEvent) => {
      const gesture = gestureRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      gestureRef.current = null
      setVisual(INITIAL_VISUAL)
    }

    const opts: AddEventListenerOptions = { passive: true }
    window.addEventListener("pointerdown", onPointerDown, opts)
    window.addEventListener("pointermove", onPointerMove, opts)
    window.addEventListener("pointerup", onPointerUp, opts)
    window.addEventListener("pointercancel", onPointerCancel, opts)

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, opts)
      window.removeEventListener("pointermove", onPointerMove, opts)
      window.removeEventListener("pointerup", onPointerUp, opts)
      window.removeEventListener("pointercancel", onPointerCancel, opts)
    }
  }, [finishGesture, router])

  return visual
}
