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
