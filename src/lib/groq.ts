// src/lib/groq.ts

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function tryGroq(apiKey: string, prompt: string, systemContext: string) {
  if (!apiKey) return null;
  
  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemContext },
          { role: "user", content: prompt }
        ]
      })
    });
    return response;
  } catch (e) {
    return null;
  }
}

export const analisarComGroq = async (prompt: string, systemContext: string = "Você é o Untbot da UNINTA Tianguá.") => {
  // Puxa as chaves das variáveis de ambiente do Vite
  const key1 = import.meta.env.VITE_GROQ_API_KEY;
  const key2 = import.meta.env.VITE_GROQ_API_KEY2;

  // 1. TENTA A PRIMEIRA CHAVE
  let result = await tryGroq(key1, prompt, systemContext);

  // 2. SE FALHAR, TENTA A SEGUNDA
  if (!result || result.status !== 200) {
    console.warn("Sistema: Chave 1 falhou. Rotacionando para Chave 2...");
    result = await tryGroq(key2, prompt, systemContext);
  }

  if (!result || result.status !== 200) {
    throw new Error("Falha na sinapse neural: todas as chaves falharam.");
  }

  const data = await result.json();
  return data.choices[0]?.message?.content || "";
};
