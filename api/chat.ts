import { Groq } from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ✅ ROTAÇÃO POR HASH (FUNCIONA NO EDGE!)
const groqKeys = [
  process.env.VITE_GROQ_API_KEY || "",
  process.env.VITE_GROQ_API_KEY2 || ""
].filter(Boolean);

let groqClients: Groq[] = [];

// ✅ FUNÇÃO CORRIGIDA - SEM ESTADO GLOBAL
function getGroqClient(query: string): Groq {
  if (groqClients.length === 0 && groqKeys.length > 0) {
    groqClients = groqKeys.map(key => new Groq({ apiKey: key }));
  }
  
  if (groqClients.length === 0) {
    throw new Error("❌ Nenhuma chave Groq válida configurada");
  }
  
  // ✅ HASH DA QUERY = ROTAÇÃO PERFEITA!
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

    // 1. CONSCIÊNCIA DO ACERVO TOTAL
    const { data: todosLivros } = await supabase
      .from('biblioteca')
      .select('titulo, categoria')
      .limit(200);

    // 2. BUSCA INTELIGENTE ESPECÍFICA
    const palavrasChave = termoBuscaCompleto
      .toLowerCase()
      .match(/\b\w{4,}\b/g) || [];
    
    let query = supabase.from('biblioteca').select('titulo, url_pdf, categoria').limit(5);
    const termoPrincipal = palavrasChave[0];

    if (termoPrincipal) {
      query = query
        .eq('titulo::text', termoPrincipal)
        .or(`titulo.ilike.%${termoPrincipal}%`);
      
      const { data: livrosTitulo } = await query;
      
      if (!livrosTitulo?.length) {
        query = supabase
          .from('biblioteca')
          .select('titulo, url_pdf, categoria')
          .or(`categoria.ilike.%${termoPrincipal}%`);
      }
    }

    const { data: livrosEncontrados } = await query;

    // 3. RANKING POR RELEVÂNCIA
    const livrosRelevantes = (livrosEncontrados || [])
      .map((livro: any) => {
        const score = palavrasChave.reduce((acc: number, palavra: string) => {
          const matchesTitulo = livro.titulo.toLowerCase().includes(palavra);
          const matchesCategoria = livro.categoria?.toLowerCase().includes(palavra);
          return acc + (matchesTitulo ? 10 : matchesCategoria ? 5 : 0);
        }, 0);
        return { ...livro, relevance_score: score };
      })
      .filter((livro: any) => livro.relevance_score > 0)
      .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
      .slice(0, 3);

    console.log(`✅ "${termoBuscaCompleto}" → ${livrosRelevantes.length} livros`);

    const listaDeLivros = todosLivros?.map((l: any) => l.titulo).join(", ") || "Biblioteca sendo organizada...";

    // 4. SUPER DIRETRIZ
    const instrucaoMestre = `
🚨 NEUROLAB UNINTA - ACERVO LEGAL ACADEMICO v2.0 ✅
MESTRE: Matheus (Responsável Legal UNINTA)

🛡️ LIVROS LEGAIS:
${livrosRelevantes.map((l: any) => `📚 ${l.titulo} [PDF AUTORIZADO]`).join('\n') || 'Nenhum específico'}

⚖️ PROTOCOLO LEGAL:
1️⃣ LIVROS DO LAB (NÃO PIRATA)
2️⃣ Pesquisa acadêmica (FAIR USE)
3️⃣ CITE os livros acima
4️⃣ SEMPRE: "PDF disponível no NeuroLab UNINTA"

QUERY: "${termoBuscaCompleto}"
${web_sources ? `WEB: ${web_sources.map((s: any) => s.title).join(', ')}` : ''}
ACERVO: ${listaDeLivros}

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

    // ✅ GROQ COM ROTAÇÃO POR HASH!
    const groqClient = getGroqClient(termoBuscaCompleto); // ← AQUI!
    
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
      fontesLab: livrosRelevantes
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
