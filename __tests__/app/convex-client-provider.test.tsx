import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppConvexProvider from "../../src/components/convex-client-provider";

const configured =
  typeof import.meta.env.VITE_CONVEX_URL === "string" &&
  import.meta.env.VITE_CONVEX_URL.trim().length > 0;

describe.skipIf(configured)("AppConvexProvider without Convex URL", () => {
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
