// LLM client via OpenRouter (OpenAI-compatible API)
// Server-side only — never import from client components

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// minimax-m2.7 for all videos (m2.5:free blocked by OpenRouter privacy settings)
const MODEL_SHORT = "minimax/minimax-m2.7";
const MODEL_LONG = "minimax/minimax-m2.7";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LLMResponse {
  choices: { message: { content: string } }[];
}

export async function callGLM(
  messages: Message[],
  temperature = 0.7,
  maxTokens = 6000,
  durationSeconds?: number,
): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY ?? process.env.GLM_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");

  const model = (durationSeconds ?? 0) > 120 ? MODEL_LONG : MODEL_SHORT;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://neuropeer-frontend.vercel.app",
      "X-Title": "NeuroPeer",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data: LLMResponse = await res.json();
  return data.choices[0]?.message?.content ?? "";
}
