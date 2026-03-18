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

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  try {
    const { prompt, contexto, query_search, web_sources } = await req.json();
    const termoBuscaCompleto = query_search || prompt;

    console.log(`🔍 Busca: "${termoBuscaCompleto}"`);

    // 1. DEBUG: VERIFICAR SE TEM LIVROS NA TABELA
    const { data: todosLivrosDebug } = await supabase
      .from('biblioteca')
      .select('titulo, url_pdf, categoria')
      .limit(10);
    
    console.log(`📚 Total livros na tabela: ${todosLivrosDebug?.length || 0}`);
    console.log(`📚 Primeiros livros:`, todosLivrosDebug?.slice(0,3));

    // 2. BUSCA MUITO MAIS AGRESSIVA
    const palavrasChave = termoBuscaCompleto
      .toLowerCase()
      .match(/\b\w{3,}\b/g) || []; // ← MUDOU: mínimo 3 letras
    
    console.log(`🔑 Palavras-chave:`, palavrasChave);

    // PRIMEIRA TENTATIVA: TÍTULO EXATO
    let livrosEncontrados: any[] = [];
    
    if (palavrasChave.length > 0) {
      const termoPrincipal = palavrasChave[0];
      
      // TENTATIVA 1: Título exato
      const { data: livrosTitulo } = await supabase
        .from('biblioteca')
        .select('titulo, url_pdf, categoria')
        .eq('titulo', termoPrincipal)
        .limit(5);
      
      console.log(`🎯 Título exato "${termoPrincipal}":`, livrosTitulo?.length || 0);
      
      if (livrosTitulo?.length) {
        livrosEncontrados = livrosTitulo;
      } else {
        // TENTATIVA 2: LIKE no título
        const { data: livrosLikeTitulo } = await supabase
          .from('biblioteca')
          .select('titulo, url_pdf, categoria')
          .or(`titulo.ilike.%${termoPrincipal}%`)
          .limit(10);
        
        console.log(`🔍 Like título "${termoPrincipal}":`, livrosLikeTitulo?.length || 0);
        livrosEncontrados = livrosLikeTitulo || [];
      }
      
      // TENTATIVA 3: Categoria (se ainda não achou)
      if (!livrosEncontrados.length && palavrasChave.length > 0) {
        const { data: livrosCategoria } = await supabase
          .from('biblioteca')
          .select('titulo, url_pdf, categoria')
          .or(palavrasChave.slice(0,3).map(p => `categoria.ilike.%${p}%`).join(','))
          .limit(10);
        
        console.log(`🏷️ Categoria:`, livrosCategoria?.length || 0);
        livrosEncontrados = livrosCategoria || [];
      }
      
      // TENTATIVA 4: QUALQUER COINCIDÊNCIA (fallback)
      if (!livrosEncontrados.length) {
        const { data: qualquerLivro } = await supabase
          .from('biblioteca')
          .select('titulo, url_pdf, categoria')
          .limit(3);
        
        console.log(`📖 Fallback qualquer livro:`, qualquerLivro?.length || 0);
        livrosEncontrados = qualquerLivro || [];
      }
    }

    // 3. RANKING MELHORADO
    const livrosRelevantes = (livrosEncontrados || [])
      .map((livro: any) => {
        const score = palavrasChave.reduce((acc: number, palavra: string) => {
          const matchesTitulo = livro.titulo?.toLowerCase().includes(palavra);
          const matchesCategoria = livro.categoria?.toLowerCase().includes(palavra);
          const matchesUrl = livro.url_pdf?.toLowerCase().includes(palavra);
          return acc + (matchesTitulo ? 15 : matchesCategoria ? 8 : matchesUrl ? 5 : 0);
        }, 0);
        
        // DEBUG: mostrar todos os livros avaliados
        console.log(`📊 "${livro.titulo}" score: ${score} | URL: ${livro.url_pdf ? '✅' : '❌'}`);
        
        return { ...livro, relevance_score: score };
      })
      .filter((livro: any) => livro.relevance_score > 0 || !palavrasChave.length) // ← MUDOU: mostra mesmo sem score se não tem palavras-chave
      .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
      .slice(0, 5); // ← AUMENTOU para 5

    console.log(`✅ LIVROS FINAIS (${livrosRelevantes.length}):`, 
      livrosRelevantes.map((l: any) => ({ titulo: l.titulo, temUrl: !!l.url_pdf }))
    );

    // 4. ACERVO TOTAL (apenas títulos)
    const { data: todosLivros } = await supabase
      .from('biblioteca')
      .select('titulo')
      .limit(100);

    const listaDeLivros = todosLivros?.map((l: any) => l.titulo).join(", ") || "Biblioteca vazia";

    // 5. INSTRUÇÃO COM PDFs REAIS
    const livrosComPdf = livrosRelevantes.filter((l: any) => l.url_pdf);
    const livrosSemPdf = livrosRelevantes.filter((l: any) => !l.url_pdf);
    
    const instrucaoMestre = `
🚨 NEUROLAB UNINTA - ACERVO LEGAL ACADEMICO v2.1 ✅

🛡️ PDFs DISPONÍVEIS AGORA (${livrosComPdf.length}):
${livrosComPdf.map((l: any, i: number) => `${i+1}️⃣ ${l.titulo}\n   📎 PDF: ${l.url_pdf}`).join('\n') || 'Nenhum PDF encontrado'}

📚 Outros relevantes (${livrosSemPdf.length}):
${livrosSemPdf.slice(0,2).map((l: any, i: number) => `${i+1}️⃣ ${l.titulo}`).join('\n') || ''}

⚖️ PROTOCOLO LEGAL:
1️⃣ APENAS PDFs DO LAB (URLs acima)
2️⃣ Cite TODOS os PDFs disponíveis
3️⃣ Sempre: "PDF direto no NeuroLab UNINTA"

QUERY: "${termoBuscaCompleto}"
ACERVO TOTAL: ${listaDeLivros.slice(0,200)}...

Você é AURA - Neurociência, TDAH, TEA, Psicofarmacologia.
`;

    let diretrizFinal = `${instrucaoMestre}\n\nCONTEXTO:\n${contexto}`;
    
    const pediuMapa = prompt.toLowerCase().includes("mapa mental");
    if (pediuMapa) {
      diretrizFinal += `
PROTOCOLO MAPA MENTAL:
1. Formato técnico
2. MAIÚSCULAS nos tópicos
3. Hifens (-) e recuos`;
    }

    const groqClient = getGroqClient(termoBuscaCompleto);
    
    const completion = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: diretrizFinal },
        { role: "user", content: prompt }
      ],
      temperature: pediuMapa ? 0.2 : 0.6,
      max_tokens: 2048,
    });

    return new Response(JSON.stringify({ 
      resposta: completion.choices[0]?.message?.content || "",
      fontesLab: livrosRelevantes, // ← RETORNA TODOS para debug
      debug: {
        totalLivrosTabela: todosLivrosDebug?.length || 0,
        palavrasChave,
        livrosComPdf: livrosComPdf.length,
        livrosSemPdf: livrosSemPdf.length
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ API Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Erro interno do servidor' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
