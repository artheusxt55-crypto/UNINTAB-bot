import { Groq } from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

// 1. Conexão com o Supabase (Usando as variáveis do seu print)
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 2. Configuração da IA (Tenta todas as chaves que você criou na Vercel)
const groq = new Groq({
  apiKey: process.env.VITE_GROQ_API_KEY || process.env.VITE_GROQ_API_KEY2 || process.env.VITE_GROQ_API_KEY_2 || ""
});

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  try {
    const { prompt, contexto } = await req.json();

    // 3. BUSCA NOS LIVROS (Ajustado para as colunas reais: id, titulo, url_pdf)
    // Buscamos pelo TÍTULO do livro já que a coluna de texto ainda não foi criada
    const palavras = prompt.split(' ').filter((p: string) => p.length > 3);
    const termoBusca = palavras[0] || prompt;
    
    const { data: livros, error: dbError } = await supabase
      .from('biblioteca')
      .select('titulo, url_pdf') 
      .ilike('titulo', `%${termoBusca}%`)
      .limit(3);

    if (dbError) {
      console.error("Erro Supabase:", dbError.message);
    }

    // Informamos à IA quais livros do Lab batem com a pesquisa do aluno
    const infoLivros = livros && livros.length > 0 
      ? `[SISTEMA]: O Lab possui estes livros sobre o tema: ${livros.map(l => l.titulo).join(", ")}. Responda tecnicamente baseando-se neles.`
      : "Responda com sua base geral de neurociência e psicofarmacologia.";

    // 4. LÓGICA DE MAPA MENTAL (Seu protocolo oficial)
    const pediuMapa = prompt.toLowerCase().includes("mapa mental");
    let diretrizFinal = `${contexto}\n\n${infoLivros}`;

    if (pediuMapa) {
      diretrizFinal += `
         PROTOCOLO DE MAPA MENTAL (ATIVADO):
         1. Formate como um MAPA MENTAL técnico.
         2. PROIBIDO o uso de asteriscos (**), hashtags (#) ou Markdown.
         3. Use LETRAS MAIÚSCULAS para os tópicos principais.
         4. Use apenas hifens (-) e recuos para os detalhes.`;
    }

    // 5. CHAMADA PARA A GROQ
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: diretrizFinal },
        { role: "user", content: prompt }
      ],
      temperature: pediuMapa ? 0.3 : 0.7,
    });

    const resposta = completion.choices[0]?.message?.content || "";

    // 6. RETORNO PARA O FRONT-END
    return new Response(JSON.stringify({ 
      resposta, 
      fontesLab: livros || [] 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Erro na API:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
