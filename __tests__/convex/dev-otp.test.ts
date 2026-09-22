import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverOtp, resolveOtpDelivery, type OtpEnv } from "../../convex/devOtp";

const HOSTED: OtpEnv = {
  CONVEX_CLOUD_URL: "https://example.eu-west-1.convex.cloud",
  CONVEX_SITE_URL: "https://example.eu-west-1.convex.site",
};

describe("resolveOtpDelivery", () => {
  it("prints a console code when OTP_ENDPOINT is missing and no hosted URL is set", () => {
    expect(resolveOtpDelivery({})).toEqual({ mode: "dev" });
    expect(resolveOtpDelivery({ OTP_ENDPOINT: "   " })).toEqual({ mode: "dev" });
  });

  it("prints a console code for anonymous and local deployments even if an endpoint is set", () => {
    expect(
      resolveOtpDelivery({
        OTP_ENDPOINT: "https://otp.example/send",
        CONVEX_DEPLOYMENT: "anonymous:anonymous-agent",
      }),
    ).toEqual({ mode: "dev" });
    expect(
      resolveOtpDelivery({
        OTP_ENDPOINT: "https://otp.example/send",
        CONVEX_DEPLOYMENT: "local:local-app",
      }),
    ).toEqual({ mode: "dev" });
  });

  it("prints a console code on loopback when the endpoint is missing", () => {
    expect(
      resolveOtpDelivery({
        CONVEX_CLOUD_URL: "http://127.0.0.1:3210",
        CONVEX_SITE_URL: "http://127.0.0.1:3211",
      }),
    ).toEqual({ mode: "dev" });
  });

  it("prints a console code for an explicit dev flag off hosted cloud", () => {
    expect(
      resolveOtpDelivery({
        AUTH_DEV_OTP: "1",
        OTP_ENDPOINT: "https://otp.example/send",
        CONVEX_CLOUD_URL: "http://127.0.0.1:3210",
      }),
    ).toEqual({ mode: "dev" });
  });

  it("uses the remote endpoint on a dev cloud deployment when it is configured", () => {
    expect(
      resolveOtpDelivery({
        ...HOSTED,
        CONVEX_DEPLOYMENT: "dev:happy-animal-123",
        OTP_ENDPOINT: "https://otp.example/send",
      }),
    ).toEqual({ mode: "remote", endpoint: "https://otp.example/send" });
  });

  it("refuses to print codes on a hosted cloud deployment when OTP_ENDPOINT is missing", () => {
    expect(resolveOtpDelivery(HOSTED)).toEqual({
      mode: "refuse",
      reason: expect.stringContaining("OTP_ENDPOINT"),
    });
    expect(
      resolveOtpDelivery({
        ...HOSTED,
        AUTH_DEV_OTP: "1",
      }),
    ).toEqual({
      mode: "refuse",
      reason: expect.stringContaining("OTP_ENDPOINT"),
    });
  });

  it("never prints codes for a prod deployment, even when the dev flag is set", () => {
    expect(
      resolveOtpDelivery({
        CONVEX_DEPLOYMENT: "prod:example-deployment",
        AUTH_DEV_OTP: "1",
      }),
    ).toEqual({
      mode: "refuse",
      reason: expect.stringContaining("OTP_ENDPOINT"),
    });
    expect(
      resolveOtpDelivery({
        ...HOSTED,
        CONVEX_DEPLOYMENT: "prod:example-deployment",
        OTP_ENDPOINT: "https://otp.example/send",
        AUTH_DEV_OTP: "1",
      }),
    ).toEqual({ mode: "remote", endpoint: "https://otp.example/send" });
  });
});

describe("deliverOtp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the 6-digit code and does not call the network in dev fallback", async () => {
    const fetchFn = vi.fn();
    const log = vi.fn();

    await deliverOtp(
      { email: "dev@example.com", token: "123456" },
      {
        env: { CONVEX_CLOUD_URL: "http://127.0.0.1:3210" },
        fetchFn,
        log,
      },
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("[DEV OTP] email=dev@example.com code=123456");
  });

  it("does not log the code when a hosted deployment has no OTP endpoint", async () => {
    const fetchFn = vi.fn();
    const log = vi.fn();

    await expect(
      deliverOtp(
        { email: "user@example.com", token: "654321" },
        { env: HOSTED, fetchFn, log },
      ),
    ).rejects.toThrow(/OTP_ENDPOINT/);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("posts the verification payload and does not log the code", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    const log = vi.fn();

    await deliverOtp(
      { email: "user@example.com", token: "654321" },
      {
        env: {
          ...HOSTED,
          OTP_ENDPOINT: "https://otp.example/send",
          CHAT_ID: "chat-1",
          APP_NAME: "Analysis",
          SECRET_KEY: "secret",
        },
        fetchFn,
        log,
      },
    );

    expect(log).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledOnce();
    const call = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://otp.example/send");
    expect(JSON.parse(String(call[1].body))).toEqual({
      email: "user@example.com",
      token: "654321",
      chatId: "chat-1",
      appName: "Analysis",
      secretKey: "secret",
    });
  });

  it("surfaces the provider error without treating the send as successful", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "upstream down" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expect(
      deliverOtp(
        { email: "user@example.com", token: "000111" },
        {
          env: { ...HOSTED, OTP_ENDPOINT: "https://otp.example/send" },
          fetchFn,
        },
      ),
    ).rejects.toThrow("upstream down");
  });
});
