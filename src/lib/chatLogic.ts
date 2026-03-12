/**
 * chatLogic.ts
 * 
 * Integração com Upstash Redis para persistência de conversas
 * e chamada à API de IA (OpenAI-compatible).
 * 
 * Configure as variáveis de ambiente no seu .env:
 *   VITE_UPSTASH_REDIS_URL=https://your-redis.upstash.io
 *   VITE_UPSTASH_REDIS_TOKEN=your-token
 *   VITE_AI_API_URL=https://api.openai.com/v1/chat/completions
 *   VITE_AI_API_KEY=sk-...
 *   VITE_AI_MODEL=gpt-4o-mini
 */

// ── Upstash Redis Config ──────────────────────────────────────────

const UPSTASH_URL = import.meta.env.VITE_UPSTASH_REDIS_URL as string | undefined;
const UPSTASH_TOKEN = import.meta.env.VITE_UPSTASH_REDIS_TOKEN as string | undefined;

async function redisRequest(command: string[], retries = 2): Promise<unknown> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.warn("[chatLogic] Upstash Redis não configurado. Usando localStorage como fallback.");
    return null;
  }

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${UPSTASH_URL}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
      });

      if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
      const data = await res.json();
      return data.result;
    } catch (err) {
      if (i === retries) {
        console.error("[chatLogic] Redis request failed:", err);
        return null;
      }
    }
  }
  return null;
}

// ── Tipos ─────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// ── Persistência de Conversas (Upstash Redis) ─────────────────────

const CONV_PREFIX = "conv:";
const CONV_LIST_KEY = "conversations";

export async function saveConversation(conv: Conversation): Promise<void> {
  const key = `${CONV_PREFIX}${conv.id}`;
  const data = JSON.stringify(conv);

  const result = await redisRequest(["SET", key, data]);

  if (result === null) {
    // Fallback: localStorage
    localStorage.setItem(key, data);
  }

  // Manter index da lista de conversas
  await redisRequest(["ZADD", CONV_LIST_KEY, String(conv.updatedAt), conv.id]);
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  const key = `${CONV_PREFIX}${id}`;
  const result = await redisRequest(["GET", key]);

  if (result && typeof result === "string") {
    return JSON.parse(result) as Conversation;
  }

  // Fallback: localStorage
  const local = localStorage.getItem(key);
  return local ? (JSON.parse(local) as Conversation) : null;
}

export async function loadAllConversations(): Promise<Conversation[]> {
  // Tentar Upstash primeiro
  const ids = await redisRequest(["ZREVRANGE", CONV_LIST_KEY, "0", "50"]);

  if (ids && Array.isArray(ids) && ids.length > 0) {
    const convs: Conversation[] = [];
    for (const id of ids) {
      const conv = await loadConversation(id as string);
      if (conv) convs.push(conv);
    }
    return convs;
  }

  // Fallback: localStorage
  const convs: Conversation[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CONV_PREFIX)) {
      try {
        convs.push(JSON.parse(localStorage.getItem(key)!) as Conversation);
      } catch {
        // ignore corrupted entries
      }
    }
  }
  return convs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteConversation(id: string): Promise<void> {
  const key = `${CONV_PREFIX}${id}`;
  await redisRequest(["DEL", key]);
  await redisRequest(["ZREM", CONV_LIST_KEY, id]);
  localStorage.removeItem(key);
}

// ── Chamada à API de IA ───────────────────────────────────────────

const AI_API_URL = import.meta.env.VITE_AI_API_URL as string || "https://api.openai.com/v1/chat/completions";
const AI_API_KEY = import.meta.env.VITE_AI_API_KEY as string | undefined;
const AI_MODEL = import.meta.env.VITE_AI_MODEL as string || "gpt-4o-mini";

export interface AIChatOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_SYSTEM_PROMPT = `Você é a Neural AI, uma assistente virtual avançada da UNINTA. 
Responda de forma clara, objetiva e em português brasileiro.
Use markdown para formatação quando apropriado.`;

export async function sendMessageToAI(
  messages: Message[],
  options: AIChatOptions = {}
): Promise<string> {
  if (!AI_API_KEY) {
    console.warn("[chatLogic] API key não configurada. Retornando resposta demo.");
    return getDemoResponse();
  }

  const {
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    temperature = 0.7,
    maxTokens = 2048,
  } = options;

  const apiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const res = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: apiMessages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("[chatLogic] AI API error:", res.status, errorBody);
      throw new Error(`AI API returned ${res.status}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "Desculpe, não consegui gerar uma resposta.";
  } catch (err) {
    console.error("[chatLogic] Erro ao chamar API de IA:", err);
    return "⚠️ Erro ao conectar com a IA. Verifique sua conexão e tente novamente.";
  }
}

// ── Respostas Demo (fallback) ─────────────────────────────────────

let demoIndex = 0;
const DEMO_RESPONSES = [
  "Olá! Sou a **Neural AI**. Como posso ajudar você hoje?\n\nPosso auxiliar com:\n- 💡 Ideias e brainstorming\n- 📝 Escrita e revisão de textos\n- 💻 Programação e código\n- 🔍 Pesquisa e análise",
  "Interessante! Deixe-me pensar sobre isso...\n\nBaseado na sua pergunta, aqui estão alguns pontos relevantes:\n\n1. **Contexto** — É importante considerar o cenário completo\n2. **Abordagem** — Existem várias maneiras de resolver isso\n3. **Resultado** — O melhor caminho depende dos seus objetivos\n\nQuer que eu aprofunde em algum desses pontos?",
  "Ótima pergunta! Aqui vai minha análise:\n\n```javascript\nconst result = await processData(input);\nconsole.log(result);\n```\n\nEssa abordagem é eficiente porque:\n- Usa processamento assíncrono\n- Minimiza o uso de memória\n- É facilmente escalável",
  "Claro! Vou te ajudar com isso. 🚀\n\nO processo envolve algumas etapas:\n\n1. Primeiro, precisamos definir os requisitos\n2. Depois, criamos a estrutura base\n3. Por fim, implementamos e testamos\n\n> \"A melhor maneira de prever o futuro é criá-lo.\" — Peter Drucker",
];

function getDemoResponse(): string {
  const response = DEMO_RESPONSES[demoIndex % DEMO_RESPONSES.length];
  demoIndex++;
  return response;
}

// ── Helpers ───────────────────────────────────────────────────────

export function createMessage(role: "user" | "assistant", content: string): Message {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

export function createConversation(title = "Nova conversa"): Conversation {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
