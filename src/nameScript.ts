// Runs a user-supplied JavaScript snippet that returns a name. The snippet is
// the *body* of an async function with three things in scope:
//   app   - the Obsidian App
//   api   - the .api of the connector plugin (e.g. Randomness, Dice Roller)
//   seed  - the seed string being named (use it or ignore it)
// It may be sync or async and should `return` a string. Example:
//   return (await api.rollUnscoped("TF-ThievesGuildName")).result
//
// This executes the user's own configuration in their own vault — the same
// model Templater/Dataview use for user scripts. It is never fed remote content.

/** Minimal shape we need from the Obsidian App to resolve a connector's api. */
export interface ScriptHost {
  plugins?: { plugins?: Record<string, { api?: unknown } | undefined> };
}

// The Function constructor for async functions (not exposed as a global).
const AsyncFunction = (Object.getPrototypeOf(async () => {}) as { constructor: unknown })
  .constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;

/** Resolve the connector plugin's api object, or undefined if unavailable. */
export function connectorApi(host: ScriptHost | undefined, pluginId: string): unknown {
  return host?.plugins?.plugins?.[pluginId]?.api;
}

/**
 * Compile and run the snippet. Returns a trimmed non-empty string, or throws
 * (caller falls back to the built-in generator). Compilation is cheap and done
 * per call so edits to the script take effect immediately.
 */
export async function runNameScript(
  script: string,
  host: ScriptHost | undefined,
  apiPluginId: string,
  seed: string,
): Promise<string> {
  const body = script.trim();
  if (!body) throw new Error('Name script is empty');
  const api = connectorApi(host, apiPluginId);
  const fn = new AsyncFunction('app', 'api', 'seed', body);
  const out = await fn(host, api, seed);
  const str = (out == null ? '' : String(out)).trim();
  if (!str) throw new Error('Name script returned an empty value');
  return str;
}
