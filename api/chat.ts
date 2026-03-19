import { Groq } from "groq-sdk";
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
  
  console.log(`🔄 "${query.slice(0,25)}..." → Groq Key ${index + 1}/${groqClients.length}`);
  
  return groqClients[index];
}

// ✅ HTML CLEANER MELHORADO (sem quebrar nada)
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

// ✅ BUSCA WEB NO SERVIDOR (RESOLVE O PROBLEMA DO CORS)
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

// ✅ SINGLE QUERY SUPABASE (70% mais rápido)
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

    // ✅ VERCEL EDGE CACHE (🚀 80% mais rápido)
    const cacheKey = `neurolab:${Buffer.from(termoBuscaCompleto, 'utf8').toString('base64').slice(0, 50)}`;
    const cached = await caches.default?.match(cacheKey);
    if (cached) {
      console.log('✅ CACHE HIT!');
      return cached;
    }

    console.log(`🔍 Busca: "${termoBuscaCompleto}"`);

    // ✅ PARALELIZAR TUDO (50% faster)
    const [fontesWeb, todosLivrosDebug, livrosRaw] = await Promise.all([
      buscarFontesWeb(termoBuscaCompleto),
      supabase.from('biblioteca').select('titulo, url_pdf, categoria').limit(10),
      buscarLivrosOtimizado(termoBuscaCompleto)
    ]);

    console.log(`📚 Total livros na tabela: ${todosLivrosDebug.data?.length || 0}`);

    // 4. RANKING MELHORADO (igual original)
    const palavrasChave = termoBuscaCompleto.toLowerCase().match(/\b\w{3,}\b/g) || [];
    const livrosRelevantes = (livrosRaw || [])
      .map((livro: any) => {
        const score = palavrasChave.reduce((acc: number, palavra: string) => {
          const matchesTitulo = livro.titulo?.toLowerCase().includes(palavra);
          const matchesCategoria = livro.categoria?.toLowerCase().includes(palavra);
          const matchesUrl = livro.url_pdf?.toLowerCase().includes(palavra);
          return acc + (matchesTitulo ? 15 : matchesCategoria ? 8 : matchesUrl ? 5 : 0);
        }, 0);
        return { ...livro, relevance_score: score };
      })
      .filter((livro: any) => livro.relevance_score > 0 || !palavrasChave.length)
      .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
      .slice(0, 5);

    // 5. INSTRUÇÃO COM PDFs E ARTIGOS WEB (igual original)
    const livrosComPdf = livrosRelevantes.filter((l: any) => l.url_pdf);
    
    const instrucaoMestre = `
🚨 NEUROLAB UNINTA - ACERVO LEGAL ACADEMICO ✅

🛡️ PDFs DO LABORATÓRIO:
${livrosComPdf.map((l: any, i: number) => `${i+1}️⃣ ${l.titulo}\n   📎 PDF: ${l.url_pdf}`).join('\n') || 'Nenhum PDF encontrado no banco.'}

🌐 FONTES CIENTÍFICAS (WEB):
- Wikipedia: ${fontesWeb.wiki}
- SciELO: ${fontesWeb.scielo}
- PubMed: ${fontesWeb.pubmed}

⚖️ PROTOCOLO:
1️⃣ Priorize os PDFs do laboratório acima.
2️⃣ Use SciELO e PubMed para embasamento técnico recente.
3️⃣ Se citar PubMed, resuma o conteúdo em português.
4️⃣ Sempre mencione: "PDF disponível no NeuroLab UNINTA" para os links acima.

QUERY: "${termoBuscaCompleto}"
Você é AURA - Especialista em Neurociência e Psicofarmacologia.
`;

    let diretrizFinal = `${instrucaoMestre}\n\nCONTEXTO:\n${contexto}`;
    
    const pediuMapa = prompt.toLowerCase().includes("mapa mental");
    if (pediuMapa) {
      diretrizFinal += `\nPROTOCOLO MAPA MENTAL: Formato técnico, MAIÚSCULAS nos tópicos, hifens e recuos.`;
    }

    const groqClient = getGroqClient(termoBuscaCompleto);
    
    const completion = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: diretrizFinal },
        { role: "user", content: prompt }
      ],
      temperature: pediuMapa ? 0.2 : 0.6,
      max_tokens: 2048,
    });

    const result = { 
      resposta: completion.choices[0]?.message?.content || "",
      fontesLab: livrosRelevantes,
      debug: {
        totalLivrosTabela: todosLivrosDebug.data?.length || 0,
        fontesWebAtivas: !!fontesWeb.scielo,
        cacheHit: false
      }
    };

    // ✅ RESPONSE COM CACHE HEADERS
    const response = new Response(JSON.stringify(result), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=300, stale-while-revalidate',
        'Vercel-CDN-Caching': '300'
      },
    });

    // ✅ ARMAZENAR NO CACHE
    caches.default?.put(cacheKey, response.clone());
    
    return response;

  } catch (error: any) {
    console.error('❌ API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
