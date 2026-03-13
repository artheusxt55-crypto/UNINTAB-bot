import { Client } from "@gradio/client";

const REDIS_URL = "https://enormous-raccoon-41416.upstash.io";
const REDIS_TOKEN = "AaHIAAIncDIwNjZhOGMxNmYzMDQ0Mjc0YjYwMTJiNjI1NDYyNDg4ZHAyNDE0MTY";

/**
 * MEMÓRIA: Salva a interação no banco de dados.
 */
export const salvarNoRedis = async (usuario: string, msg: string) => {
  try {
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
 * CÉREBRO: Ponte para a API interna no Back-end.
 */
export const analisarComGroq = async (prompt: string, contexto: string) => {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, contexto }),
    });

    if (!response.ok) throw new Error("Erro na resposta da API.");
    const data = await response.json();
    return data.resposta;
  } catch (error) {
    console.error("Erro na ponte neural:", error);
    throw new Error("⚠️ Conexão neural interrompida.");
  }
};

/**
 * PESQUISA TÉCNICA: Wikipedia e Fontes Acadêmicas (RAG)
 */
const buscarFontesExternas = async (prompt: string) => {
  const fontes: { simbolo: string; fonte: string; url: string; conteudo: string }[] = [];
  const gatilhos = ["dasein", "lacan", "freud", "neuroimagem", "tdah", "tea", "psicopatologia"];
  const termoEncontrado = gatilhos.find(t => prompt.toLowerCase().includes(t));

  if (termoEncontrado) {
    try {
      const wikiRes = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(termoEncontrado)}`);
      if (wikiRes.ok) {
        const data = await wikiRes.json();
        fontes.push({
          simbolo: "🌐 [W]",
          fonte: "Wikipedia",
          url: data.content_urls.desktop.page,
          conteudo: data.extract
        });
      }
    } catch (e) { /* silent fail */ }
  }
  return fontes;
};

/**
 * MOTOR HÍBRIDO: Integra Pesquisa + AI
 */
export const analisarComContextoHibrido = async (prompt: string, contexto: string) => {
  const fontes = await buscarFontesExternas(prompt);
  const dadosExtraidos = fontes.map(f => `[FONTE ${f.fonte}]: ${f.conteudo}`).join(" | ");
  
  const contextoFinal = `${contexto} | Referências Reais: ${dadosExtraidos}`;
  const respostaAI = await analisarComGroq(prompt, contextoFinal);

  if (fontes.length > 0) {
    const links = fontes.map(f => `${f.simbolo} **${f.fonte}**: [Acesse aqui](${f.url})`).join("\n");
    return `${respostaAI}\n\n---\n**FONTES OFICIAIS:**\n${links}`;
  }

  return respostaAI;
};
