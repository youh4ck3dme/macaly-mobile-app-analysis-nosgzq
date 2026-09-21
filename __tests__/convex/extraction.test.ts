import { describe, expect, it } from "vitest"
import {
  isTextLayerUsable,
  locateExcerpt,
  normalizeForMatch,
} from "../../convex/extraction"

describe("isTextLayerUsable", () => {
  it("accepts a normal text page", () => {
    const text = "Toto je bežná strana dokumentu s dostatkom alfanumerických znakov na použitie textovej vrstvy."
    expect(isTextLayerUsable(text, 1)).toBe(true)
  })

  it("rejects a near-empty scanned page", () => {
    expect(isTextLayerUsable("", 1)).toBe(false)
    expect(isTextLayerUsable("Strana 1", 1)).toBe(false)
  })

  it("applies the multi-page average rule", () => {
    // 90 alfanumerických znakov: priemer 18/stranu zlyhá, 30/stranu prejde.
    const text = "abc ".repeat(30)
    expect(isTextLayerUsable(text, 5)).toBe(false)
    expect(isTextLayerUsable(text, 3)).toBe(true)
  })
})

describe("normalizeForMatch", () => {
  it("removes decomposed diacritics", () => {
    expect(normalizeForMatch("psík detektív".normalize("NFD"))).toBe("psik detektiv")
  })

  it("lowercases the text", () => {
    expect(normalizeForMatch("Depozitum")).toBe("depozitum")
  })

  it("collapses whitespace", () => {
    expect(normalizeForMatch("  A\n\nB\tC  ")).toBe("a b c")
  })
})

describe("locateExcerpt", () => {
  it("verifies a hit on a specific page with a 1-based page number", () => {
    const source = {
      text: "Prva strana obsahuje drahocenne doklady. Druha strana popisuje viac detailov.",
      pageTexts: [
        "Prva strana obsahuje drahocenne doklady.",
        "Druha strana popisuje viac detailov.",
      ],
    }
    expect(locateExcerpt("Druha strana popisuje viac detailov.", source)).toEqual({
      verified: true,
      page: 2,
    })
  })

  it("verifies a cross-page excerpt only in the joined text with page null", () => {
    const source = {
      text: "koniec prvej strany. zaciatok druhej strany.",
      pageTexts: ["koniec prvej strany.", "zaciatok druhej strany."],
    }
    expect(locateExcerpt("koniec prvej strany. zaciatok druhej strany.", source)).toEqual({
      verified: true,
      page: null,
    })
  })

  it("rejects a missing excerpt", () => {
    const source = { text: "Nieco uplne ine.", pageTexts: ["Nieco uplne ine."] }
    expect(locateExcerpt("Uplne vymysleny citat z dokumentu", source)).toEqual({
      verified: false,
      page: null,
    })
  })

  it("rejects excerpts shorter than 12 normalized chars", () => {
    const source = { text: "kratky citat tu", pageTexts: ["kratky citat tu"] }
    // "kratky cita" má po normalizácii 11 znakov (pod prahom 12), ale je prítomná v texte.
    expect(locateExcerpt("kratky cita", source)).toEqual({ verified: false, page: null })
  })
})
