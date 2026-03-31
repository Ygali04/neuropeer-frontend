// GLM-4.7-Flash API client (OpenAI-compatible)
// Server-side only — never import from client components

const GLM_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const GLM_MODEL = "glm-4.7-flash";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GLMResponse {
  choices: { message: { content: string } }[];
}

export async function callGLM(messages: Message[], temperature = 0.7, maxTokens = 1200): Promise<string> {
  const key = process.env.GLM_KEY;
  if (!key) throw new Error("GLM_KEY not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout
  const res = await fetch(GLM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: GLM_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GLM API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data: GLMResponse = await res.json();
  return data.choices[0]?.message?.content ?? "";
}
