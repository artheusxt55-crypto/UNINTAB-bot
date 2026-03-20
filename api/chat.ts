import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

// ✅ Helpers robustos
const resumirConteudo = (texto: string, maxChars: number = 400): string => {
  if (!texto) return '';
  return texto.length <= maxChars ? texto : texto.substring(0, maxChars).trim() + '...';
};

const limparTexto = (html: string): string => {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim().slice(0, 500);
};

// ✅ Web Search com Timeouts individuais + SciELO adicionada
async function buscarFontesWebOtimizada(termo: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const t = encodeURIComponent(termo);

  try {
    const [resWiki, resSemantic, resPubMed, resScielo] = await Promise.allSettled([
      fetch(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${t}&format=json&origin=*`, { signal: controller.signal })
        .then(r => r.json()).then(d => limparTexto(d.query?.search?.[0]?.snippet || "")),
      fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${t}&limit=2&fields=title,abstract,year`, { signal: controller.signal })
        .then(r => r.json()).then(d => d.data?.map((p: any) => `${p.title} (${p.year}): ${resumirConteudo(p.abstract || '', 150)}`).join('\n') || ""),
      fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${t}&retmax=2&retmode=json`, { signal: controller.signal })
        .then(r => r.json()).then(d => d.esearchresult?.idlist?.length ? `PubMed IDs: ${d.esearchresult.idlist.join(', ')}` : ""),
      // ✅ Adicionado: Busca SciELO
      fetch(`https://search.scielo.org/api/v1/search?q=${t}&count=2&format=json`, { signal: controller.signal })
        .then(r => r.json()).then(d => d.dia_response?.docs?.map((doc: any) => `SciELO: ${doc.title?.[0]} (${doc.year})`).join('\n') || "")
    ]);
    clearTimeout(timeout);
    return {
      wiki: resWiki.status === 'fulfilled' ? resWiki.value : "",
      semantic: resSemantic.status === 'fulfilled' ? resSemantic.value : "",
      pubmed: resPubMed.status === 'fulfilled' ? resPubMed.value : "",
      scielo: resScielo.status === 'fulfilled' ? resScielo.value : "" // ✅ Adicionado
    };
  } catch { return { wiki: "", semantic: "", pubmed: "", scielo: "" }; }
}

async function buscarGoogleReal(termo: string): Promise<string> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return "";
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: termo, gl: "br", hl: "pt-br", num: 3 }),
    });
    const data = await res.json();
    return data.organic?.map((r: any) => `🔗 ${r.title}: ${r.link}`).join('\n') || "";
  } catch { return ""; }
}

export const config = { runtime: 'edge', regions: ['iad1'] };

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const body = await req.json();
    const { prompt, contexto, query_search } = body;
    const termoBusca = query_search || prompt;

    if (!prompt?.trim()) return new Response(JSON.stringify({ error: 'Prompt vazio' }), { status: 400 });

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

    // ✅ Execução paralela (Máxima Performance)
    const [fontesWeb, livrosRaw, googleReal] = await Promise.allSettled([
      buscarFontesWebOtimizada(termoBusca),
      supabase.from('biblioteca').select('titulo, url_pdf, categoria, conteudo_extra').or(`titulo.ilike.%${termoBusca}%,conteudo_extra.ilike.%${termoBusca}%`).limit(5),
      buscarGoogleReal(termoBusca)
    ]);

    const livros = livrosRaw.status === 'fulfilled' ? (livrosRaw.value.data || []) : [];
    const web = fontesWeb.status === 'fulfilled' ? fontesWeb.value : { wiki: '', semantic: '', pubmed: '', scielo: '' };
    const google = googleReal.status === 'fulfilled' ? googleReal.value : '';

    const systemPrompt = `AURA - Lab Neuro-UNINTA (Mestre: Matheus).
    Priorize os LIVROS DO LAB abaixo. Se necessário, use os dados da Web e Google.
    
    🛡️ LIVROS DO LAB:
    ${livros.map((l:any) => `📖 ${l.titulo}\n📄 ${resumirConteudo(l.conteudo_extra || '', 300)}\n🔗 ${l.url_pdf}`).join('\n\n') || 'Nenhum livro encontrado.'}
    
    🌐 GOOGLE: ${google}
    📚 ACADÊMICO: Wiki: ${web.wiki} | Semantic: ${web.semantic} | PubMed: ${web.pubmed} | SciELO: ${web.scielo}
    
    INSTRUÇÕES: Cite URLs, seja técnico e limite a 300 palavras.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 1000
    });

    return new Response(JSON.stringify({
      resposta: completion.choices[0]?.message?.content,
      fontesLab: livros.map((l: any) => ({ titulo: l.titulo, url: l.url_pdf }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Erro na AURA', details: error.message }), { status: 500 });
  }
}
