/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as analyses from "../analyses.js";
import type * as analysisNormalize from "../analysisNormalize.js";
import type * as analyze from "../analyze.js";
import type * as analyzeEnqueue from "../analyzeEnqueue.js";
import type * as auth from "../auth.js";
import type * as cases from "../cases.js";
import type * as extraction from "../extraction.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as macaly from "../macaly.js";
import type * as mistral from "../mistral.js";
import type * as mistralHealth from "../mistralHealth.js";
import type * as settings from "../settings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  analyses: typeof analyses;
  analysisNormalize: typeof analysisNormalize;
  analyze: typeof analyze;
  analyzeEnqueue: typeof analyzeEnqueue;
  auth: typeof auth;
  cases: typeof cases;
  extraction: typeof extraction;
  files: typeof files;
  http: typeof http;
  macaly: typeof macaly;
  mistral: typeof mistral;
  mistralHealth: typeof mistralHealth;
  settings: typeof settings;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
