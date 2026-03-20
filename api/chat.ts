import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Configuração do Serper (Google Search Real)
const SERPER_KEY = "61f8706663aaf74373acfe0c4a7d175fed829dcc";

const groqKeys = [
  process.env.VITE_GROQ_API_KEY || "",
  process.env.VITE_GROQ_API_KEY2 || ""
].filter(Boolean);

let groqClients: Groq[] = [];

function getGroqClient(query: string): Groq {
  if (groqClients.length === 0 && groqKeys.length > 0) {
    groqClients = groqKeys.map(key => new Groq({ apiKey: key }));
  }
  if (groqClients.length === 0) throw new Error("❌ Nenhuma chave Groq configurada");
  const hash = query.toLowerCase().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = hash % groqClients.length;
  return groqClients[index];
}

// ✅ Nova função para buscar links Reais e evitar alucinações
async function buscarGoogleReal(termo: string) {
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { 
        "X-API-KEY": SERPER_KEY, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({ 
        q: `${termo} neurociência artigo científico`, 
        gl: "br", 
        hl: "pt-br", 
        num: 3 
      }),
    });
    const data = await response.json();
    return data.organic?.map((r: any) => `- ${r.title}: ${r.link}`).join('\n') || "Nenhum link adicional encontrado.";
  } catch (e) {
    return "Erro ao conectar com Google Search.";
  }
}

function limparTexto(html: string) {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 800);
}

async function buscarFontesWebAntigas(termo: string) {
  const t = encodeURIComponent(termo);
  try {
    const [resWiki, resScielo, resPubmed] = await Promise.allSettled([
      fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${t}`).then(r => r.json()),
      fetch(`https://search.scielo.org/?q=${t}&lang=pt&count=2`).then(r => r.text()),
      fetch(`https://pubmed.ncbi.nlm.nih.gov/?term=${t}`).then(r => r.text())
    ]);
    return {
      wiki: resWiki.status === 'fulfilled' ? (resWiki.value.extract || "") : "",
      scielo: resScielo.status === 'fulfilled' ? limparTexto(resScielo.value) : "",
      pubmed: resPubmed.status === 'fulfilled' ? limparTexto(resPubmed.value) : ""
    };
  } catch (e) {
    return { wiki: "", scielo: "", pubmed: "" };
  }
}

async function buscarLivrosOtimizado(termoBuscaCompleto: string) {
  const palavrasChave = termoBuscaCompleto.toLowerCase().match(/\b\w{3,}\b/g) || [];
  if (!palavrasChave.length) return [];
  const termoPrincipal = palavrasChave[0];
  const { data } = await supabase
    .from('biblioteca')
    .select('titulo, url_pdf, categoria, conteudo_extra')
    .or(`titulo.ilike.%${termoPrincipal}%,conteudo_extra.ilike.%${termoPrincipal}%`)
    .limit(10);
  return data || [];
}

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  try {
    const { prompt, contexto, query_search } = await req.json();
    const termoBuscaCompleto = query_search || prompt;

    console.log(`🔍 Lab Untbot - RAG Híbrido: "${termoBuscaCompleto}"`);

    // ✅ Executa buscas em paralelo
    const [fontesWeb, livrosRaw, googleReal] = await Promise.all([
      buscarFontesWebAntigas(termoBuscaCompleto),
      buscarLivrosOtimizado(termoBuscaCompleto),
      buscarGoogleReal(termoBuscaCompleto) // Busca via Serper
    ]);

    const palavrasChave = termoBuscaCompleto.toLowerCase().match(/\b\w{3,}\b/g) || [];
    const livrosRelevantes = (livrosRaw || [])
      .map((livro: any) => {
        let score = 0;
        palavrasChave.forEach(palavra => {
          if (livro.titulo?.toLowerCase().includes(palavra)) score += 20;
          if (livro.conteudo_extra?.toLowerCase().includes(palavra)) score += 10;
        });
        return { ...livro, relevance_score: score };
      })
      .filter((livro: any) => livro.relevance_score > 0)
      .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
      .slice(0, 3);

    const instrucaoMestre = `
🚨 NEUROLAB UNINTA - BASE DE CONHECIMENTO ATUALIZADA ✅
🛡️ CONTEÚDO DOS LIVROS DO LABORATÓRIO (PRIORIDADE):
${livrosRelevantes.map((l: any, i: number) => `
📖 LIVRO ${i+1}: ${l.titulo}
📄 CONTEÚDO: ${l.conteudo_extra ? l.conteudo_extra.substring(0, 1800) : 'Texto não disponível'}
📎 PDF DRIVE: ${l.url_pdf}
`).join('\n---')}

🌐 LINKS REAIS E ARTIGOS (VIA GOOGLE SEARCH):
${googleReal}

🌍 OUTRAS FONTES:
- Wikipedia: ${fontesWeb.wiki}
- SciELO/PubMed Snippets: ${fontesWeb.scielo.substring(0, 200)}

⚖️ PROTOCOLO AURA:
1. Responda como AURA (Mestre Matheus), técnica e humana.
2. Use os PDFs do Lab como fonte principal.
3. Se citar fontes externas, use APENAS os links fornecidos em "LINKS REAIS".
4. NUNCA invente links ou nomes de artigos.
`;

    const groqClient = getGroqClient(termoBuscaCompleto);
    const completion = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: `${instrucaoMestre}\n\nCONTEXTO:\n${contexto}` },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
    });

    return new Response(JSON.stringify({ 
      resposta: completion.choices[0]?.message?.content || "",
      fontesLab: livrosRelevantes.map(l => ({ titulo: l.titulo, url: l.url_pdf }))
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
