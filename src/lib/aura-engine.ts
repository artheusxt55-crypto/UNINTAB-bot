import { Client } from "@gradio/client";

// CONFIGURAÇÕES DE ACESSO À MEMÓRIA (REDIS/UPSTASH)
const REDIS_URL = "https://enormous-raccoon-41416.upstash.io";
const REDIS_TOKEN = "AaHIAAIncDIwNjZhOGMxNmYzMDQ0Mjc0YjYwMTJiNjI1NDYyNDg4ZHAyNDE0MTY";

/**
 * MEMÓRIA: Salva a interação no banco de dados.
 */
export const salvarNoRedis = async (usuario: string, msg: string) => {
  try {
    // Usando o método REST do Upstash
    await fetch(`${REDIS_URL}/lpush/${usuario}/${encodeURIComponent(msg)}?_token=${REDIS_TOKEN}`);
  } catch (e) {
    console.error("Erro ao salvar no cérebro digital:", e);
  }
};

/**
 * MEMÓRIA: Busca as últimas conversas.
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
 * VOZ: Conecta ao modelo Gradio da UNINTA.
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
 * CÉREBRO: Agora chama a sua API interna no Back-end (Vercel Functions).
 */
export const analisarComGroq = async (prompt: string, contexto: string) => {
  try {
    // Chamada para a rota que você criou em /api/chat.ts
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, contexto }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Erro na resposta da API.");
    }

    const data = await response.json();
    return data.resposta; // Retorna a string processada pelo back-end
  } catch (error) {
    console.error("Erro na ponte neural (API):", error);
    throw new Error("⚠️ Conexão neural interrompida. Verifique os logs do servidor.");
  }
};
