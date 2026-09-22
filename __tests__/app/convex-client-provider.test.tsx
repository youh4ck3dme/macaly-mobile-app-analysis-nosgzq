import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppConvexProvider from "../../src/components/convex-client-provider";

describe("AppConvexProvider without Convex URL", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_CONVEX_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders a setup screen instead of mounting the app", () => {
    render(
      <AppConvexProvider>
        <p>app shell</p>
      </AppConvexProvider>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Chýba VITE_CONVEX_URL — spusti convex dev",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("app shell")).not.toBeInTheDocument();
  });
});
