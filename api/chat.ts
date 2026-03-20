// ✅ SEM DEPENDÊNCIAS PROBLEMÁTICAS - Edge Runtime Perfeito
const resumirConteudo = (texto: string, maxChars = 400): string => 
  texto ? (texto.length <= maxChars ? texto : texto.slice(0, maxChars).trim() + '...') : '';

const limparTexto = (html: string): string => 
  html ? html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 500) : '';

// ✅ Web Search Completa (Wikipedia + SciELO + PubMed + Semantic)
async function buscarFontesWebOtimizada(termo: string) {
  const t = encodeURIComponent(termo);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const [wiki, semantic, pubmed, scielo] = await Promise.allSettled([
      // Wikipedia
      fetch(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${t}&format=json&origin=*`, {
        signal: controller.signal
      }).then(r => r.json()).then(d => limparTexto(d.query?.search?.[0]?.snippet || '')),

      // Semantic Scholar
      fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${t}&limit=2&fields=title,abstract,year`, {
        signal: controller.signal
      }).then(r => r.json()).then(d => 
        d.data?.[0] ? `${d.data[0].title || ''} (${d.data[0].year || ''}): ${resumirConteudo(d.data[0].abstract || '', 150)}` : ''
      ),

      // PubMed
      fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${t}&retmax=2&retmode=json`, {
        signal: controller.signal
      }).then(r => r.json()).then(d => 
        d.esearchresult?.idlist?.[0] ? `PubMed ID: ${d.esearchresult.idlist[0]}` : ''
      ),

      // ✅ SciELO (BRASIL! 🇧🇷)
      fetch(`https://search.scielo.org/api/v1/search?q=${t}&count=2&format=json&lang=pt`, {
        signal: controller.signal
      }).then(r => r.json()).then(d => 
        d.dia_response?.docs?.[0]?.title?.[0] ? `SciELO: ${d.dia_response.docs[0].title[0]}` : ''
      )
    ]);

    clearTimeout(timeoutId);

    return {
      wiki: (wiki.status === 'fulfilled' ? wiki.value : ''),
      semantic: (semantic.status === 'fulfilled' ? semantic.value : ''),
      pubmed: (pubmed.status === 'fulfilled' ? pubmed.value : ''),
      scielo: (scielo.status === 'fulfilled' ? scielo.value : '')
    };
  } catch {
    return { wiki: '', semantic: '', pubmed: '', scielo: '' };
  }
}

export const config = { 
  runtime: 'edge', 
  regions: ['iad1']
};

export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST required' }), { 
        status: 405, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'JSON inválido' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const { prompt = '', query_search } = body;
    const termoBusca = query_search || prompt;

    if (!prompt.trim()) {
      return new Response(JSON.stringify({ error: 'Prompt vazio' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // ✅ SUPABASE REST API direto com prefixo VITE_
    let livros: any[] = [];
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; 

    if (supabaseUrl && supabaseKey) {
      try {
        const url = `${supabaseUrl}/rest/v1/biblioteca?select=titulo,url_pdf,categoria,conteudo_extra&or=(titulo.ilike.%${encodeURIComponent(termoBusca)}%,conteudo_extra.ilike.%${encodeURIComponent(termoBusca)}%)&limit=5&order=created_at.desc`;
        
        const supabaseRes = await fetch(url, {
          method: 'GET',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });

        if (supabaseRes.ok) {
          livros = await supabaseRes.json();
        }
      } catch (e) {
        console.error('Supabase falhou:', e);
      }
    }

    // ✅ Google Serper com prefixo VITE_
    let googleResults = '';
    const serperKey = process.env.VITE_SERPER_API_KEY;
    if (serperKey) {
      try {
        const serperRes = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 
            'X-API-KEY': serperKey, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({ 
            q: termoBusca, 
            gl: 'br', 
            hl: 'pt-br', 
            num: 3 
          })
        });
        const serperData = await serperRes.json();
        googleResults = serperData.organic?.slice(0, 3)
          .map((r: any) => `🔗 ${r.title.slice(0, 50)}: ${r.link}`)
          .join('\n') || '';
      } catch {}
    }

    const fontesWeb = await buscarFontesWebOtimizada(termoBusca);

    const systemPrompt = `AURA - Lab Neuro-UNINTA (Mestre: Matheus)

🛡️ LIVROS DO LAB (${livros.length}):
${livros.map((l: any) => 
  `📖 "${l.titulo}"
📄 ${resumirConteudo(l.conteudo_extra || l.categoria || '', 280)}
🔗 ${l.url_pdf || 'PDF interno'}`
).join('\n\n') || 'Nenhum livro encontrado no lab.'}

🌐 GOOGLE:
${googleResults}

📚 ACADÊMICO:
Wikipedia: ${fontesWeb.wiki.slice(0, 180)}
SciELO 🇧🇷: ${fontesWeb.scielo}
Semantic: ${fontesWeb.semantic.slice(0, 120)}
PubMed: ${fontesWeb.pubmed}

⚖️ REGRAS:
1. Priorize LIVROS DO LAB
2. Cite URLs disponíveis
3. Técnico + acessível
4. Máximo 350 palavras`;

    // ✅ GROQ NATIVE com prefixo VITE_
    const groqKey = process.env.VITE_GROQ_API_KEY;
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 1000
      })
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.text();
      throw new Error(`Groq falhou: ${groqResponse.status} - ${errorData}`);
    }

    const groqData = await groqResponse.json();
    const resposta = groqData.choices?.[0]?.message?.content || 'Resposta gerada pela AURA';

    return new Response(JSON.stringify({
      resposta,
      fontesLab: livros.map((l: any) => ({
        titulo: l.titulo,
        url: l.url_pdf || '#',
        categoria: l.categoria
      }))
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-AURA-Version': '2.1-vite'
      }
    });

  } catch (error: any) {
    console.error('AURA Error:', error);
    return new Response(JSON.stringify({ 
      error: 'AURA temporariamente indisponível',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
