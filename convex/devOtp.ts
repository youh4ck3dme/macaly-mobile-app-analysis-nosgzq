/**
 * Local/dev delivery for the email OTP provider.
 *
 * Console fallback is allowed only when the deployment is clearly local or dev:
 * missing OTP_ENDPOINT on a loopback backend, CONVEX_DEPLOYMENT anonymous/local
 * (or dev when the endpoint is unset), or AUTH_DEV_OTP=1 off a hosted prod cloud.
 * A hosted *.convex.cloud deployment — including production — never prints codes
 * just because OTP_ENDPOINT is unset.
 */

export type OtpEnv = {
  OTP_ENDPOINT?: string;
  CHAT_ID?: string;
  APP_NAME?: string;
  SECRET_KEY?: string;
  AUTH_DEV_OTP?: string;
  CONVEX_DEPLOYMENT?: string;
  CONVEX_CLOUD_URL?: string;
  CONVEX_SITE_URL?: string;
};

export type OtpDelivery =
  | { mode: "dev" }
  | { mode: "remote"; endpoint: string }
  | { mode: "refuse"; reason: string };

const REFUSE_REASON =
  "OTP_ENDPOINT is not configured. Refusing to print verification codes outside a local/dev deployment.";

const PROD_DEPLOYMENT_SLUG = "decisive-terrier-395";

export function resolveOtpDelivery(env: OtpEnv): OtpDelivery {
  const endpoint = env.OTP_ENDPOINT?.trim() ?? "";
  const kind = deploymentKind(env.CONVEX_DEPLOYMENT);

  // Hosted prod, including decisive-terrier-395, never prints a code just
  // because OTP_ENDPOINT is missing — even if AUTH_DEV_OTP or a dev/local
  // deployment label is also set.
  if (isProductionKind(kind) || isNamedProduction(env)) {
    if (!endpoint) return { mode: "refuse", reason: REFUSE_REASON };
    return { mode: "remote", endpoint };
  }

  if (kind === "anonymous" || kind === "local") {
    return { mode: "dev" };
  }

  const devFlag = env.AUTH_DEV_OTP === "1";
  const hosted = isHostedConvex(env.CONVEX_CLOUD_URL) || isHostedConvex(env.CONVEX_SITE_URL);

  if (devFlag && (!hosted || kind === "dev")) {
    return { mode: "dev" };
  }

  if (endpoint) {
    return { mode: "remote", endpoint };
  }

  if (isLoopback(env.CONVEX_CLOUD_URL) || isLoopback(env.CONVEX_SITE_URL)) {
    return { mode: "dev" };
  }

  if (kind === "dev") {
    return { mode: "dev" };
  }

  if (!hosted && !env.CONVEX_CLOUD_URL?.trim() && !env.CONVEX_SITE_URL?.trim()) {
    return { mode: "dev" };
  }

  return { mode: "refuse", reason: REFUSE_REASON };
}

export async function deliverOtp(
  params: { email: string; token: string },
  options?: {
    env?: OtpEnv;
    fetchFn?: typeof fetch;
    log?: (message: string) => void;
  },
): Promise<void> {
  const env = options?.env ?? process.env;
  const decision = resolveOtpDelivery(env);

  if (decision.mode === "dev") {
    const log = options?.log ?? console.log;
    log(`[DEV OTP] email=${params.email} code=${params.token}`);
    return;
  }

  if (decision.mode === "refuse") {
    throw new Error(decision.reason);
  }

  const missing = (["CHAT_ID", "SECRET_KEY"] as const).filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`OTP delivery is not configured. Missing ${missing.join(", ")}.`);
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const response = await fetchFn(decision.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      token: params.token,
      chatId: env.CHAT_ID,
      appName: env.APP_NAME?.trim() || "My App",
      secretKey: env.SECRET_KEY,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const upstream =
      errorData &&
      typeof errorData === "object" &&
      "error" in errorData &&
      typeof errorData.error === "string"
        ? errorData.error
        : "";
    const message =
      upstream && !upstream.includes(params.token)
        ? upstream
        : "Failed to send verification email";
    throw new Error(message);
  }
}

function deploymentKind(deployment: string | undefined): string {
  return (deployment ?? "").trim().toLowerCase().split(":")[0] ?? "";
}

function isProductionKind(kind: string): boolean {
  return kind === "prod" || kind === "production" || kind === "preview";
}

function isNamedProduction(env: OtpEnv): boolean {
  const deployment = (env.CONVEX_DEPLOYMENT ?? "").toLowerCase();
  if (deployment.includes(PROD_DEPLOYMENT_SLUG)) return true;
  const hosts = [hostname(env.CONVEX_CLOUD_URL), hostname(env.CONVEX_SITE_URL)];
  return hosts.some(
    (host) =>
      host === `${PROD_DEPLOYMENT_SLUG}.eu-west-1.convex.cloud` ||
      host === `${PROD_DEPLOYMENT_SLUG}.eu-west-1.convex.site`,
  );
}

function isLoopback(rawUrl: string | undefined): boolean {
  const host = hostname(rawUrl);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isHostedConvex(rawUrl: string | undefined): boolean {
  const host = hostname(rawUrl);
  return host.endsWith(".convex.cloud") || host.endsWith(".convex.site");
}

function hostname(rawUrl: string | undefined): string {
  const value = rawUrl?.trim();
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}
