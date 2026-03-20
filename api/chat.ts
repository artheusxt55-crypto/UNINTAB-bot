// ✅ Função auxiliar para resumir conteúdo e evitar token overflow
function resumirConteudo(texto: string, maxChars: number = 400): string {
  if (!texto) return '';
  if (texto.length <= maxChars) return texto;
  return texto.substring(0, maxChars).trim() + '...';
}

// ✅ Função auxiliar para extrair texto limpo de HTML (fallback)
function limparTexto(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent?.slice(0, 500) || '';
}

// ✅ Web sources CORRIGIDAS com APIs reais
async function buscarFontesWebOtimizada(termo: string) {
  const t = encodeURIComponent(termo);
  try {
    const [resWikiSearch, resSemanticScholar, resPubMed] = await Promise.allSettled([
      // ✅ Wikipedia SEARCH (não summary por título exato)
      fetch(
        `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${t}&format=json&srwhat=text&srprop=snippet&srlimit=1&origin=*`
      ).then(r => r.json())
        .then(data => data.query?.search?.[0]?.snippet || ""),
      
      // ✅ Semantic Scholar (melhor que Scielo scraping)
      fetch(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${t}&limit=2&fields=title,abstract,url,year&offset=0`
      ).then(r => r.json())
        .then(data => {
          if (!data.data?.length) return '';
          return data.data.map((p: any) => 
            `${p.title || 'Sem título'} (${p.year || ''}): ${resumirConteudo(p.abstract || '', 150)}`
          ).join('\n');
        }),
      
      // ✅ PubMed E-utilities (API oficial)
      fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${t}&retmax=2&retmode=json`
      ).then(r => r.json())
        .then(data => {
          const ids = data.esearchresult?.idlist || [];
          return ids.length ? `PubMed IDs: ${ids.join(', ')}` : '';
        })
    ]);

    return {
      wiki: typeof resWikiSearch === 'string' ? resWikiSearch : "",
      semantic: typeof resSemanticScholar === 'string' ? resSemanticScholar : "",
      pubmed: typeof resPubMed === 'string' ? resPubMed : ""
    };
  } catch (e) {
    console.error('Erro fontes web:', e);
    return { wiki: "", semantic: "", pubmed: "" };
  }
}

// ✅ Supabase otimizado mantido (já estava bom)
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

    // ✅ Buscas paralelas OTIMIZADAS
    const [fontesWeb, livrosRaw, googleReal] = await Promise.allSettled([
      buscarFontesWebOtimizada(termoBuscaCompleto),
      buscarLivrosOtimizado(termoBuscaCompleto),
      buscarGoogleReal(termoBuscaCompleto)
    ]);

    const palavrasChave = termoBuscaCompleto.toLowerCase().match(/\b\w{3,}\b/g) || [];
    
    // ✅ Scoring mantido (excelente)
    const livrosRelevantes = (livrosRaw.status === 'fulfilled' ? livrosRaw.value : [])
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

    // ✅ Prompt OTIMIZADO (máx 4k tokens)
    const conteudoLivros = livrosRelevantes
      .map((l: any, i: number) => `
📖 LIVRO ${i+1}: ${l.titulo}
📄 CONTEÚDO: ${resumirConteudo(l.conteudo_extra || '', 350)}
📎 PDF: ${l.url_pdf}`)
      .join('\n---');

    const fontesWebFormatadas = fontesWeb.status === 'fulfilled' ? fontesWeb.value : { wiki: '', semantic: '', pubmed: '' };

    const instrucaoMestre = `🚨 NEUROLAB UNINTA - BASE ATUALIZADA ✅

🛡️ LIVROS DO LABORATÓRIO (PRIORIDADE MÁXIMA):
${conteudoLivros || 'Nenhum livro encontrado'}

🌐 GOOGLE SEARCH:
${googleReal || 'Sem resultados'}

🌍 FONTES ACADÊMICAS:
Wikipedia: ${resumirConteudo(fontesWebFormatadas.wiki, 200)}
Semantic Scholar: ${resumirConteudo(fontesWebFormatadas.semantic, 200)}
PubMed: ${fontesWebFormatadas.pubmed}

⚖️ PROTOCOLO AURA:
1. Responda como AURA (Mestre Matheus) - técnica + humana
2. PDFs do Lab = fonte #1
3. Cite APENAS links fornecidos
4. NUNCA invente referências`;

    const groqClient = getGroqClient(termoBuscaCompleto);
    
    const completion = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { 
          role: "system", 
          content: `${instrucaoMestre}\n\nCONTEXTO ADICIONAL:\n${contexto || ''}` 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 2000 // ✅ Limite explícito
    });

    return new Response(
      JSON.stringify({ 
        resposta: completion.choices[0]?.message?.content || "Desculpe, não consegui processar sua solicitação.",
        fontesLab: livrosRelevantes.map((l: any) => ({ 
          titulo: l.titulo, 
          url: l.url_pdf,
          score: l.relevance_score 
        }))
      }), 
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json', 
          'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
          'X-RAG-Livros': livrosRelevantes.length.toString()
        },
      }
    );

  } catch (error: any) {
    console.error('Erro handler:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Serviço temporariamente indisponível',
        detalhes: process.env.NODE_ENV === 'development' ? error.message : undefined
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
