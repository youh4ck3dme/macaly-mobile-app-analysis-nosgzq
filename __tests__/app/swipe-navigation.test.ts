import { describe, it, expect, vi, afterEach } from "vitest"
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
} from "@/lib/swipe-navigation"

describe("swipe-navigation helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("computes threshold between 60 and 80 from viewport width", () => {
    expect(getSwipeThreshold(200)).toBe(60)
    expect(getSwipeThreshold(375)).toBe(75)
    expect(getSwipeThreshold(500)).toBe(80)
  })

  it("detects left/right edge starts", () => {
    expect(edgeDirectionFromStart(10, 390)).toBe("back")
    expect(edgeDirectionFromStart(EDGE_ZONE_PX, 390)).toBe("back")
    expect(edgeDirectionFromStart(EDGE_ZONE_PX + 1, 390)).toBeNull()
    expect(edgeDirectionFromStart(390 - EDGE_ZONE_PX, 390)).toBe("forward")
    expect(edgeDirectionFromStart(200, 390)).toBeNull()
  })

  it("resolves back swipe only for rightward horizontal edge gesture", () => {
    expect(
      resolveSwipeIntent({
        dx: 80,
        dy: 10,
        threshold: 70,
        edgeDirection: "back",
      }),
    ).toBe("back")

    expect(
      resolveSwipeIntent({
        dx: 40,
        dy: 5,
        threshold: 70,
        edgeDirection: "back",
      }),
    ).toBeNull()

    expect(
      resolveSwipeIntent({
        dx: 80,
        dy: 100,
        threshold: 70,
        edgeDirection: "back",
      }),
    ).toBeNull()

    expect(
      resolveSwipeIntent({
        dx: -80,
        dy: 5,
        threshold: 70,
        edgeDirection: "back",
      }),
    ).toBeNull()
  })

  it("resolves forward swipe only for leftward horizontal edge gesture", () => {
    expect(
      resolveSwipeIntent({
        dx: -80,
        dy: 8,
        threshold: 70,
        edgeDirection: "forward",
      }),
    ).toBe("forward")

    expect(
      resolveSwipeIntent({
        dx: 80,
        dy: 8,
        threshold: 70,
        edgeDirection: "forward",
      }),
    ).toBeNull()
  })

  it("maps drag progress for visual feedback", () => {
    expect(swipeProgress(35, 70, "back")).toBe(0.5)
    expect(swipeProgress(-35, 70, "forward")).toBe(0.5)
    expect(swipeProgress(-10, 70, "back")).toBe(0)
    expect(swipeProgress(200, 70, "back")).toBe(1)
  })

  it("gates navigation on history availability", () => {
    expect(canNavigate("back", { canGoBack: true, canGoForward: false })).toBe(true)
    expect(canNavigate("back", { canGoBack: false, canGoForward: true })).toBe(false)
    expect(canNavigate("forward", { canGoBack: true, canGoForward: false })).toBe(false)
    expect(canNavigate("forward", { canGoBack: false, canGoForward: true })).toBe(true)
    expect(canNavigate(null, { canGoBack: true, canGoForward: true })).toBe(false)
  })

  it("tracks forward availability across push/back using TSR index", () => {
    const tracker = createHistoryIndexTracker()
    tracker.sync(0)
    expect(tracker.canGoForward(0)).toBe(false)

    tracker.sync(1, "PUSH")
    tracker.sync(2, "PUSH")
    expect(tracker.canGoForward(2)).toBe(false)

    tracker.sync(1, "BACK")
    expect(tracker.canGoForward(1)).toBe(true)

    // New push truncates forward stack
    tracker.sync(2, "PUSH")
    expect(tracker.canGoForward(2)).toBe(false)
  })

  it("reads __TSR_index safely", () => {
    expect(readHistoryIndex({ __TSR_index: 3 })).toBe(3)
    expect(readHistoryIndex({})).toBe(0)
    expect(readHistoryIndex(null)).toBe(0)
  })

  it("ignores carousel, tablist, and horizontally scrollable ancestors", () => {
    const carousel = document.createElement("div")
    carousel.setAttribute("data-slot", "carousel")
    const child = document.createElement("button")
    carousel.appendChild(child)
    document.body.appendChild(carousel)
    expect(shouldIgnoreSwipeTarget(child)).toBe(true)
    carousel.remove()

    const tabs = document.createElement("div")
    tabs.setAttribute("role", "tablist")
    const tab = document.createElement("button")
    tabs.appendChild(tab)
    document.body.appendChild(tabs)
    expect(shouldIgnoreSwipeTarget(tab)).toBe(true)
    tabs.remove()

    const scroller = document.createElement("div")
    Object.defineProperty(scroller, "scrollWidth", { configurable: true, get: () => 800 })
    Object.defineProperty(scroller, "clientWidth", { configurable: true, get: () => 320 })
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      overflowX: "auto",
    } as CSSStyleDeclaration)
    const inner = document.createElement("span")
    scroller.appendChild(inner)
    document.body.appendChild(scroller)
    expect(shouldIgnoreSwipeTarget(inner)).toBe(true)
    scroller.remove()

    const plain = document.createElement("div")
    document.body.appendChild(plain)
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      overflowX: "visible",
    } as CSSStyleDeclaration)
    expect(shouldIgnoreSwipeTarget(plain)).toBe(false)
    plain.remove()
  })
})
