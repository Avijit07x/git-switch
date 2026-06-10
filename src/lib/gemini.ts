// Single-responsibility: call Google's Gemini API to (a) list models the
// caller's API key has access to and (b) draft a commit message from a
// staged diff. Frontend-only client so the API key never has to round-trip
// through Rust.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_DIFF_CHARS = 12_000;

function endpointFor(model: string): string {
  return `${API_BASE}/models/${model}:generateContent`;
}

export interface ListedModel {
  /** Bare model id, e.g. "gemini-1.5-flash" (without the "models/" prefix). */
  id: string;
  /** Human display name from the API, e.g. "Gemini 1.5 Flash". */
  displayName: string;
}

interface RawListedModel {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

interface ListModelsResponse {
  models?: RawListedModel[];
  error?: { message?: string };
}

/** Returns the gemini-* models the caller's API key can actually invoke. */
export async function listGeminiModels(apiKey: string): Promise<ListedModel[]> {
  if (!apiKey.trim()) {
    throw new Error("API key is empty.");
  }
  const response = await fetch(
    `${API_BASE}/models?key=${encodeURIComponent(apiKey)}`,
  );
  const data = (await response.json()) as ListModelsResponse;
  if (!response.ok) {
    throw new Error(
      data.error?.message ?? `Gemini API error (HTTP ${response.status})`,
    );
  }
  return (data.models ?? [])
    .filter(
      (m) =>
        m.name.startsWith("models/gemini-") &&
        (m.supportedGenerationMethods ?? []).includes("generateContent"),
    )
    .map((m) => ({
      id: m.name.replace(/^models\//, ""),
      displayName: m.displayName ?? m.name.replace(/^models\//, ""),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

function buildPrompt(diff: string): string {
  const truncated = diff.length > MAX_DIFF_CHARS;
  return [
    "Write a single Conventional Commits message for the staged diff below.",
    "",
    "Hard rules:",
    "- Format: <type>(<optional scope>): <subject>",
    "- type ∈ {feat, fix, chore, docs, refactor, test, style, perf, build, ci}",
    "- Subject: imperative, lowercase, ≤ 72 chars, no trailing period",
    "- Body (optional): blank line then 1-3 short bullets starting with '-' OR 1-2 sentences",
    "- Each body line ≤ 72 chars. NEVER leave a sentence unfinished.",
    "- Output ONLY the commit message text. No preamble, markdown, backticks, or quotes.",
    "- Keep it concise. Prefer omitting the body when the subject is self-explanatory.",
    truncated
      ? `\nNote: diff truncated at ${MAX_DIFF_CHARS} chars; summarize what you can see.`
      : "",
    "",
    "Diff:",
    truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateCommitMessage(
  apiKey: string,
  model: string,
  diff: string,
): Promise<string> {
  if (!apiKey.trim()) {
    throw new Error("Gemini API key is not set. Open Settings to add one.");
  }
  if (!model.trim()) {
    throw new Error("No Gemini model selected. Open Settings to pick one.");
  }
  if (!diff.trim()) {
    throw new Error("No staged changes — nothing to summarize.");
  }

  const response = await fetch(
    `${endpointFor(model)}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(diff) }] }],
        generationConfig: {
          temperature: 0.3,
          stopSequences: ["```"],
        },
      }),
    },
  );

  const data = (await response.json()) as GenerateContentResponse;

  if (!response.ok) {
    throw new Error(
      data.error?.message ?? `Gemini API error (HTTP ${response.status})`,
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }
  return text.trim();
}

// Treat both "model doesn't exist" and "quota exhausted" as triggers to
// auto-pick a different model. limit:0 means the key has no free quota for
// that model at all — pick something more generous instead.
function shouldFallbackModel(message: string): boolean {
  return /not found|not supported|not available|unsupported model|quota|limit:\s*0|resource_exhausted|rate.?limit/i.test(
    message,
  );
}

// Prefer models with the widest free-tier availability so the auto-fallback
// lands on one that actually works for first-time keys.
const PREFERENCE_PATTERNS: RegExp[] = [
  /^gemini-1\.5-flash-8b$/,
  /^gemini-1\.5-flash$/,
  /^gemini-1\.5-flash/,
  /^gemini-1\.5-pro/,
  /^gemini-2\.5-flash-lite/,
  /^gemini-2\.0-flash-lite/,
  /^gemini-2\.5-flash/,
  /^gemini-2\.0-flash/,
];

function pickFallbackModel(
  available: ListedModel[],
  exclude: ReadonlySet<string>,
): ListedModel | null {
  const pool = available.filter((m) => !exclude.has(m.id));
  if (pool.length === 0) return null;
  for (const pattern of PREFERENCE_PATTERNS) {
    const match = pool.find((m) => pattern.test(m.id));
    if (match) return match;
  }
  return pool[0];
}

export interface GeneratedCommitMessage {
  message: string;
  /** Model that actually produced the message (may differ from preferred). */
  model: string;
}

/** Generates a commit message, transparently retrying on the next-best model
 *  when the preferred one is missing or out of quota. */
export async function generateCommitMessageWithFallback(
  apiKey: string,
  preferredModel: string,
  diff: string,
  onModelSwitch?: (from: string, to: string) => void,
): Promise<GeneratedCommitMessage> {
  const tried = new Set<string>();
  let currentModel = preferredModel;
  let available: ListedModel[] | null = null;

  while (true) {
    tried.add(currentModel);
    try {
      const message = await generateCommitMessage(apiKey, currentModel, diff);
      return { message, model: currentModel };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!shouldFallbackModel(msg)) throw err;

      available ??= await listGeminiModels(apiKey);
      const next = pickFallbackModel(available, tried);
      if (!next) {
        throw new Error(
          `No working Gemini model for this key. Last error: ${msg}`,
        );
      }
      onModelSwitch?.(currentModel, next.id);
      currentModel = next.id;
    }
  }
}
