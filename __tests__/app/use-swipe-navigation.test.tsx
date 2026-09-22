import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useSwipeNavigation, resetSwipeNavigationTrackerForTests } from "@/hooks/use-swipe-navigation"

const back = vi.fn()
const forward = vi.fn()
let canGoBackValue = false
let historyIndex = 0
const subscribers = new Set<(args: { action: { type: string } }) => void>()

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    history: {
      back,
      forward,
      canGoBack: () => canGoBackValue,
      location: {
        get state() {
          return { __TSR_index: historyIndex }
        },
      },
      subscribe: (cb: (args: { action: { type: string } }) => void) => {
        subscribers.add(cb)
        return () => subscribers.delete(cb)
      },
    },
  }),
}))

function firePointer(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  props: Partial<PointerEvent> & { clientX: number; clientY: number },
) {
  window.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      ...props,
    }),
  )
}

describe("useSwipeNavigation", () => {
  beforeEach(() => {
    resetSwipeNavigationTrackerForTests()
    back.mockReset()
    forward.mockReset()
    canGoBackValue = false
    historyIndex = 0
    subscribers.clear()
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("swipes right from the left edge to go back when history allows it", () => {
    vi.useFakeTimers()
    canGoBackValue = true
    historyIndex = 2

    renderHook(() => useSwipeNavigation())

    act(() => {
      firePointer("pointerdown", { clientX: 8, clientY: 200 })
      firePointer("pointermove", { clientX: 100, clientY: 205 })
      firePointer("pointerup", { clientX: 100, clientY: 205 })
    })

    act(() => {
      vi.advanceTimersByTime(160)
    })

    expect(back).toHaveBeenCalledTimes(1)
    expect(forward).not.toHaveBeenCalled()
  })

  it("ignores back swipe on the first history entry", () => {
    vi.useFakeTimers()
    canGoBackValue = false
    historyIndex = 0

    renderHook(() => useSwipeNavigation())

    act(() => {
      firePointer("pointerdown", { clientX: 8, clientY: 200 })
      firePointer("pointermove", { clientX: 120, clientY: 200 })
      firePointer("pointerup", { clientX: 120, clientY: 200 })
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(back).not.toHaveBeenCalled()
    expect(forward).not.toHaveBeenCalled()
  })

  it("swipes left from the right edge to go forward after a back", () => {
    vi.useFakeTimers()
    canGoBackValue = true
    historyIndex = 2

    renderHook(() => useSwipeNavigation())

    // Establish max index via PUSH notifications, then simulate being one step back.
    act(() => {
      historyIndex = 2
      subscribers.forEach((cb) => cb({ action: { type: "PUSH" } }))
      historyIndex = 1
      subscribers.forEach((cb) => cb({ action: { type: "BACK" } }))
    })

    act(() => {
      firePointer("pointerdown", { clientX: 380, clientY: 220 })
      firePointer("pointermove", { clientX: 280, clientY: 225 })
      firePointer("pointerup", { clientX: 280, clientY: 225 })
    })

    act(() => {
      vi.advanceTimersByTime(160)
    })

    expect(forward).toHaveBeenCalledTimes(1)
    expect(back).not.toHaveBeenCalled()
  })

  it("does not steal vertical scroll gestures", () => {
    vi.useFakeTimers()
    canGoBackValue = true
    historyIndex = 1

    renderHook(() => useSwipeNavigation())

    act(() => {
      firePointer("pointerdown", { clientX: 8, clientY: 120 })
      firePointer("pointermove", { clientX: 20, clientY: 220 })
      firePointer("pointerup", { clientX: 20, clientY: 220 })
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(back).not.toHaveBeenCalled()
  })
})
