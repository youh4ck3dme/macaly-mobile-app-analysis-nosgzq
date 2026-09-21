// @macaly-generated setup-convex-db-helper:v1

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required Convex environment variable: ${name}`)
  }
  return value
}

function headers(): Record<string, string> {
  const result: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${requiredEnv("MACALY_API_TOKEN")}`,
  }
  const bypass = process.env.MACALY_BYPASS_HEADER
  if (!bypass) return result

  const separator = bypass.indexOf(":")
  const name = bypass.slice(0, separator).trim().toLowerCase()
  const value = bypass.slice(separator + 1).trim()
  if (separator < 1 || name !== "x-vercel-protection-bypass" || !value) {
    throw new Error("Invalid MACALY_BYPASS_HEADER")
  }
  result[name] = value
  return result
}

/**
 * Best-effort request deadline. The default Convex runtime does not expose
 * `AbortSignal`, so only `"use node"` actions abort on the deadline; elsewhere
 * the platform action timeout stays the only limit.
 */
function requestTimeout(milliseconds: number): AbortSignal | undefined {
  if (
    typeof AbortSignal === "undefined" ||
    typeof AbortSignal.timeout !== "function"
  ) {
    return undefined
  }
  return AbortSignal.timeout(milliseconds)
}

/**
 * Calls a protected Macaly client-app POST endpoint that accepts and returns
 * JSON. Use a specialized fetch implementation for streaming or multipart.
 * Keep this helper and its credentials in backend-only code.
 */
export async function callMacalyJson(
  path: string,
  body: Record<string, unknown> & { chatId?: never },
): Promise<Record<string, unknown>> {
  const baseUrl = requiredEnv("MACALY_BASE_URL").replace(/\/$/, "")
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      ...body,
      chatId: requiredEnv("MACALY_CHAT_ID"),
    }),
    signal: requestTimeout(120_000),
  })

  if (response.status === 402) {
    throw new Error("AI credits are currently unavailable.")
  }
  if (!response.ok) {
    throw new Error(`Service request failed (${response.status}).`)
  }
  return (await response.json()) as Record<string, unknown>
}
