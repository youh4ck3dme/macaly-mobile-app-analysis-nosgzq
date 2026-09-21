"use node";

import { internalAction } from "./_generated/server";

/**
 * @deprecated Diagnostic retained only for Convex contract compatibility.
 * The Mistral key and analysis chain were verified; this no longer calls the API.
 */
export const check = internalAction({
  args: {},
  handler: async () => {
    return { retired: true } as const;
  },
});
