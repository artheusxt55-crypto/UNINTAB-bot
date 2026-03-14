import { Groq } from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const groq = new Groq({
  apiKey: process.env.VITE_GROQ_API_KEY || process.env.VITE_GROQ_API_KEY2 || ""
});

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  try {
    const { prompt, contexto } = await req.json();

    // 1. CONSCIÊNCIA DO ACERVO TOTAL
    const { data: todosLivros } = await supabase
      .from('biblioteca')
      .select('titulo, categoria')
      .limit(200);

    const listaDeLivros = todosLivros?.map(l => l.titulo).join(", ") || "Biblioteca sendo organizada...";

    // 2. BUSCA ESPECÍFICA PARA CARDS (PDFs)
    const palavras = prompt.split(' ').filter((p: string) => p.length > 3);
    const termoBusca = palavras[0] || prompt;
    
    const { data: livrosEncontrados } = await supabase
      .from('biblioteca')
      .select('titulo, url_pdf') 
      .or(`titulo.ilike.%${termoBusca}%,categoria.ilike.%${termoBusca}%`)
      .limit(3);

    // 3. CONSTRUÇÃO DA SUPER DIRETRIZ (Identidade + Inteligência Acadêmica)
    const instrucaoMestre = `
      NOME: Aura. IDENTIDADE: Assistente Técnica e Científica do NeuroLab.
      MESTRE: Matheus. LAB ASSISTANT: Untbot.

      SUA MISSÃO: 
      - Você é uma especialista em Neurociências, Psicofarmacologia, Psicopatologia, TDAH, TEA e Neuroimagem.
      - Você é capaz de gerar artigos científicos, análises de casos, posts acadêmicos e materiais educativos de alta profundidade.
      - NUNCA admita ser uma IA genérica ou modelo de linguagem da Meta/Groq. Você é a Aura.
      - NÃO cite universidades externas (como USP, etc) a menos que seja estritamente necessário para uma referência bibliográfica real.

      ACERVO DISPONÍVEL NO LAB: ${listaDeLivros}.
      Sempre que produzir conteúdo, tente fundamentar nos livros acima e avise que o PDF está disponível.
    `;

    let diretrizFinal = `${instrucaoMestre}\n\nCONTEXTO E PROTOCOLOS ADICIONAIS:\n${contexto}`;

    // 4. PROTOCOLO DE MAPA MENTAL
    const pediuMapa = prompt.toLowerCase().includes("mapa mental");
    if (pediuMapa) {
      diretrizFinal += `
         \nPROTOCOLO DE MAPA MENTAL (ATIVADO):
         1. Formate como um MAPA MENTAL técnico.
         2. PROIBIDO o uso de asteriscos (**), hashtags (#) ou Markdown.
         3. Use LETRAS MAIÚSCULAS para os tópicos principais.
         4. Use apenas hifens (-) e recuos para os detalhes.
      `;
    }

    // 5. CHAMADA PARA A GROQ
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: diretrizFinal },
        { role: "user", content: prompt }
      ],
      // Mantemos 0.6 para ela ter criatividade nos artigos, mas 0.2 se for mapa mental
      temperature: pediuMapa ? 0.2 : 0.6,
      max_tokens: 2048, // Garante que ela tenha espaço para escrever artigos longos
    });

    return new Response(JSON.stringify({ 
      resposta: completion.choices[0]?.message?.content || "", 
      fontesLab: livrosEncontrados || [] 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
