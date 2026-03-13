import { Client } from "@gradio/client";

const REDIS_URL = "https://enormous-raccoon-41416.upstash.io";
const REDIS_TOKEN = "AaHIAAIncDIwNjZhOGMxNmYzMDQ0Mjc0YjYwMTJiNjI1NDYyNDg4ZHAyNDE0MTY";

export const salvarNoRedis = async (usuario: string, msg: string) => {
  try {
    await fetch(`${REDIS_URL}/lpush/${usuario}/${encodeURIComponent(msg)}?_token=${REDIS_TOKEN}`);
  } catch (e) {
    console.error("Erro ao salvar no cérebro digital:", e);
  }
};

export const buscarDoRedis = async (usuario: string) => {
  try {
    const res = await fetch(`${REDIS_URL}/lrange/${usuario}/0/10?_token=${REDIS_TOKEN}`);
    const data = await res.json();
    return data.result || [];
  } catch (e) {
    return [];
  }
};

export const falarTexto = async (texto: string) => {
  try {
    const app = await Client.connect("Ttheus/uninta-voice");
    const result = await app.predict("/sintetizar", { text: texto }) as any;
    if (result.data && result.data[0]) {
      new Audio(result.data[0].url).play();
    }
  } catch (e) { console.error("Erro voz:", e); }
};

export const analisarComGroq = async (prompt: string, contexto: string) => {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, contexto }),
  });
  const data = await res.json();
  return data.resposta;
};

/**
 * PESQUISA ACADÊMICA ATIVA
 */
const buscarFontesExternas = async (prompt: string) => {
  const fontes: any[] = [];
  const gatilhos = ["dasein", "lacan", "freud", "neuroimagem", "tdah", "tea", "psicopatologia"];
  const termo = gatilhos.find(t => prompt.toLowerCase().includes(t));

  if (termo) {
    // 1. Wikipedia (Definições)
    try {
      const wRes = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(termo)}`);
      const wData = await wRes.json();
      if (wData.extract) {
        fontes.push({ simbolo: "🌐 [W]", fonte: "Wikipedia", url: wData.content_urls.desktop.page, conteudo: wData.extract });
      }
    } catch (e) {}

    // 2. Artigos Científicos (Crossref API para dados reais)
    if (prompt.toLowerCase().includes("artigo") || prompt.toLowerCase().includes("estudo")) {
      try {
        const cRes = await fetch(`https://api.crossref.org/works?query=${encodeURIComponent(termo)}&rows=1`);
        const cData = await cRes.json();
        if (cData.message.items.length > 0) {
          const art = cData.message.items[0];
          fontes.push({ 
            simbolo: "🔬 [A]", 
            fonte: "Base Acadêmica (Crossref)", 
            url: art.URL, 
            conteudo: `Artigo: ${art.title[0]}. Publicado em: ${art.publisher}. DOI: ${art.DOI}` 
          });
        }
      } catch (e) {
        // Fallback para link de busca se a API falhar
        fontes.push({ simbolo: "🔬 [A]", fonte: "Google Scholar", url: `https://scholar.google.com.br/scholar?q=${termo}`, conteudo: "Pesquisa acadêmica sobre " + termo });
      }
    }
  }
  return fontes;
};

export const analisarComContextoHibrido = async (prompt: string, contexto: string) => {
  const fontes = await buscarFontesExternas(prompt);
  const infoFontes = fontes.map(f => f.conteudo).join(" | ");
  const respostaAI = await analisarComGroq(prompt, `${contexto} | Fatos Reais: ${infoFontes}`);

  if (fontes.length > 0) {
    const rodapé = "\n\n---\n**FONTES OFICIAIS:**\n" + fontes.map(f => `${f.simbolo} **${f.fonte}**: [Acessar](${f.url})`).join("\n");
    return `${respostaAI}${rodapé}`;
  }
  return respostaAI;
};
