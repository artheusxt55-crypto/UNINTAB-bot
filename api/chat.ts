import Groq from "groq-sdk"; // Mudança sutil na importação
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const groqKeys = [
  process.env.VITE_GROQ_API_KEY || "",
  process.env.VITE_GROQ_API_KEY2 || ""
].filter(Boolean);

let groqClients: Groq[] = [];

function getGroqClient(query: string): Groq {
  if (groqClients.length === 0 && groqKeys.length > 0) {
    groqClients = groqKeys.map(key => new Groq({ apiKey: key }));
  }
  
  if (groqClients.length === 0) {
    throw new Error("❌ Nenhuma chave Groq válida configurada");
  }
  
  const hash = query
    .toLowerCase()
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = hash % groqClients.length;
  
  return groqClients[index];
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

async function buscarFontesWeb(termo: string) {
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
  const filtros = [
    `titulo.eq.${termoPrincipal}`,
    `titulo.ilike.%${termoPrincipal}%`
  ].concat(palavrasChave.slice(0,3).map(p => `categoria.ilike.%${p}%`));

  const { data } = await supabase
    .from('biblioteca')
    .select('titulo, url_pdf, categoria')
    .or(filtros.join(','))
    .limit(10);

  return data || [];
}

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  try {
    const { prompt, contexto, query_search } = await req.json();
    const termoBuscaCompleto = query_search || prompt;

    // ✅ CORREÇÃO DO CACHE: No Edge, usamos apenas Headers de Cache na Response
    // Removido caches.default que causava o erro 500

    console.log(`🔍 Busca Lab Neuro: "${termoBuscaCompleto}"`);

    const [fontesWeb, livrosRaw] = await Promise.all([
      buscarFontesWeb(termoBuscaCompleto),
      buscarLivrosOtimizado(termoBuscaCompleto)
    ]);

    const palavrasChave = termoBuscaCompleto.toLowerCase().match(/\b\w{3,}\b/g) || [];
    const livrosRelevantes = (livrosRaw || [])
      .map((livro: any) => {
        const score = palavrasChave.reduce((acc: number, palavra: string) => {
          const matchesTitulo = livro.titulo?.toLowerCase().includes(palavra);
          const matchesCategoria = livro.categoria?.toLowerCase().includes(palavra);
          return acc + (matchesTitulo ? 15 : matchesCategoria ? 8 : 0);
        }, 0);
        return { ...livro, relevance_score: score };
      })
      .filter((livro: any) => livro.relevance_score > 0)
      .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
      .slice(0, 5);

    const instrucaoMestre = `
🚨 NEUROLAB UNINTA - ACERVO LEGAL ACADEMICO ✅
🛡️ PDFs DO LABORATÓRIO:
${livrosRelevantes.map((l: any, i: number) => `${i+1}️⃣ ${l.titulo}\n 📎 PDF: ${l.url_pdf}`).join('\n') || 'Nenhum PDF específico encontrado.'}

🌐 FONTES CIENTÍFICAS (WEB):
- Wiki: ${fontesWeb.wiki}
- SciELO: ${fontesWeb.scielo}
- PubMed: ${fontesWeb.pubmed}

⚖️ PROTOCOLO: Priorize PDFs do Lab. Cite fontes Web para neurociência recente.
Você é AURA do Lab Neuro-UNINTA (Mestre Matheus).
`;

    const groqClient = getGroqClient(termoBuscaCompleto);
    
    const completion = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: `${instrucaoMestre}\n\nCONTEXTO:\n${contexto}` },
        { role: "user", content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 2048,
    });

    return new Response(JSON.stringify({ 
      resposta: completion.choices[0]?.message?.content || "",
      fontesLab: livrosRelevantes
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600' // Cache de 1 hora na Vercel
      },
    });

  } catch (error: any) {
    console.error('❌ API Error:', error);
    return new Response(JSON.stringify({ error: "Erro interno na conexão neural", details: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
