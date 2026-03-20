import Groq from "groq-sdk";
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
  
  // ✅ Agora buscando também o 'conteudo_extra' para a AURA poder ler
  const { data } = await supabase
    .from('biblioteca')
    .select('titulo, url_pdf, categoria, conteudo_extra')
    .or(`titulo.ilike.%${termoPrincipal}%,conteudo_extra.ilike.%${termoPrincipal}%`)
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

    console.log(`🔍 Lab Untbot (195 Livros) - Analisando: "${termoBuscaCompleto}"`);

    const [fontesWeb, livrosRaw] = await Promise.all([
      buscarFontesWeb(termoBuscaCompleto),
      buscarLivrosOtimizado(termoBuscaCompleto)
    ]);

    const palavrasChave = termoBuscaCompleto.toLowerCase().match(/\b\w{3,}\b/g) || [];
    
    // ✅ Sistema de Rankeamento Melhorado
    const livrosRelevantes = (livrosRaw || [])
      .map((livro: any) => {
        let score = 0;
        palavrasChave.forEach(palavra => {
          if (livro.titulo?.toLowerCase().includes(palavra)) score += 20;
          if (livro.conteudo_extra?.toLowerCase().includes(palavra)) score += 10;
          if (livro.categoria?.toLowerCase().includes(palavra)) score += 5;
        });
        return { ...livro, relevance_score: score };
      })
      .filter((livro: any) => livro.relevance_score > 0)
      .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
      .slice(0, 3); // Enviamos os 3 melhores para não estourar o limite de memória (tokens)

    // ✅ Instrução Mestra com injeção do conteúdo dos livros
    const instrucaoMestre = `
🚨 NEUROLAB UNINTA - BASE DE CONHECIMENTO ATUALIZADA ✅
🛡️ CONTEÚDO DOS LIVROS DO LABORATÓRIO (PRIORIDADE ABSOLUTA):
${livrosRelevantes.map((l: any, i: number) => `
LIVRO ${i+1}: ${l.titulo}
TRECHO RELEVANTE: ${l.conteudo_extra ? l.conteudo_extra.substring(0, 2000) : 'Texto não disponível'}
📎 ACESSO PDF: ${l.url_pdf}
`).join('\n---')}

🌐 COMPLEMENTOS CIENTÍFICOS (WEB):
- Wikipedia: ${fontesWeb.wiki}
- SciELO/PubMed (Resumos): ${fontesWeb.scielo.substring(0, 300)}...

⚖️ PROTOCOLO AURA:
1. Use os "TRECHOS RELEVANTES" acima para fundamentar sua resposta.
2. Seja técnica, mas humana (Estilo Mestre Matheus).
3. Se o livro não tiver a resposta, use as fontes Web.
Você é AURA, a inteligência do Lab Neuro-UNINTA.
`;

    const groqClient = getGroqClient(termoBuscaCompleto);
    
    const completion = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: `${instrucaoMestre}\n\nCONTEXTO DO USUÁRIO:\n${contexto}` },
        { role: "user", content: prompt }
      ],
      temperature: 0.5, // Menos criatividade, mais precisão técnica
      max_tokens: 1500,
    });

    return new Response(JSON.stringify({ 
      resposta: completion.choices[0]?.message?.content || "",
      fontesLab: livrosRelevantes.map(l => ({ titulo: l.titulo, url: l.url_pdf }))
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600'
      },
    });

  } catch (error: any) {
    console.error('❌ Erro Neural:', error);
    return new Response(JSON.stringify({ error: "Erro na sinapse da AURA", details: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
