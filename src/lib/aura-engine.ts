import { Client } from "@gradio/client";

// CONFIGURAÇÕES DE ACESSO À MEMÓRIA (REDIS/UPSTASH)
const REDIS_URL = "https://enormous-raccoon-41416.upstash.io";
const REDIS_TOKEN = "AaHIAAIncDIwNjZhOGMxNmYzMDQ0Mjc0YjYwMTJiNjI1NDYyNDg4ZHAyNDE0MTY";

/**
 * MEMÓRIA: Salva a interação no banco de dados para a Aura não esquecer.
 */
export const salvarNoRedis = async (usuario: string, msg: string) => {
  try {
    await fetch(`${REDIS_URL}/lpush/${usuario}/${encodeURIComponent(msg)}?_token=${REDIS_TOKEN}`);
  } catch (e) {
    console.error("Erro ao salvar no cérebro digital:", e);
  }
};

/**
 * MEMÓRIA: Busca as últimas conversas para dar contexto à IA.
 */
export const buscarDoRedis = async (usuario: string) => {
  try {
    const res = await fetch(`${REDIS_URL}/lrange/${usuario}/0/10?_token=${REDIS_TOKEN}`);
    const data = await res.json();
    return data.result || [];
  } catch (e) {
    return [];
  }
};

/**
 * VOZ: Conecta ao seu modelo Gradio e sintetiza o texto em áudio.
 */
export const falarTexto = async (texto: string) => {
  try {
    const app = await Client.connect("Ttheus/uninta-voice");
    const result = await app.predict("/sintetizar", { text: texto }) as any;
    
    if (result.data && result.data[0]) {
      const audioUrl = result.data[0].url;
      const audio = new Audio(audioUrl);
      await audio.play();
      return true;
    }
  } catch (error) {
    console.error("Falha na saída de voz neural:", error);
    return false;
  }
};

/**
 * CÉREBRO: Processa a resposta usando a Groq com rotação de chaves.
 */
export const analisarComGroq = async (prompt: string, contexto: string) => {
  // Puxa as chaves das variáveis de ambiente da Vercel
  const chaves = [
    import.meta.env.VITE_GROQ_API_KEY,
    import.meta.env.VITE_GROQ_API_KEY2
  ];

  for (const key of chaves) {
    if (!key) continue;

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: contexto },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 1024
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices[0].message.content;
      }
      
      console.warn(`Chave falhou (Status: ${response.status}). Tentando próxima...`);
    } catch (e) {
      console.error("Erro na requisição Groq:", e);
    }
  }

  throw new Error("Todas as sinapses neurais falharam. Verifique as chaves na Vercel.");
};
