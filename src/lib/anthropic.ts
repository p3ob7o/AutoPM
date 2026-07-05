import Anthropic from "@anthropic-ai/sdk";

export const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";

/**
 * Returns an Anthropic SDK client with the Managed Agents beta header pinned.
 * Not invoked during the scaffold milestone — deploy/run plans use this.
 */
export function makeClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    defaultHeaders: { "anthropic-beta": MANAGED_AGENTS_BETA },
  });
}
