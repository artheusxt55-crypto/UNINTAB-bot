import { Groq } from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

// 1. Conexão segura com o Lab (Supabase)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY,
});

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  try {
    const { prompt, contexto } = await req.json();

    // 2. BUSCA ATIVA NA BIBLIOTECA DO LAB (USP, AVASUS, etc.)
    // Pegamos a primeira palavra relevante para buscar no banco
    const termoBusca = prompt.split(' ').filter((p: string) => p.length > 3)[0] || prompt;
    
    const { data: livros } = await supabase
      .from('biblioteca')
      .select('titulo, conteudo_trecho, url_pdf')
      .ilike('conteudo_trecho', `%${termoBusca}%`)
      .limit(2);

    const infoLivros = livros?.map(l => `[FONTE OFICIAL LAB: ${l.titulo}]: ${l.conteudo_trecho}`).join("\n") || "";

    // 3. Integração do Contexto (Livros + Instruções de Mapa Mental)
    const pediuMapa = prompt.toLowerCase().includes("mapa mental");
    
    let diretrizFinal = `${contexto}\n\nCONHECIMENTO EXTRAÍDO DOS LIVROS DO LAB:\n${infoLivros}`;

    if (pediuMapa) {
      diretrizFinal += `
         PROTOCOLO DE MAPA MENTAL (ATIVADO):
         1. Formate como um MAPA MENTAL técnico.
         2. PROIBIDO o uso de asteriscos (**), hashtags (#) ou Markdown.
         3. Use LETRAS MAIÚSCULAS para os tópicos principais.
         4. Use apenas hifens (-) e recuos para os detalhes.`;
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: diretrizFinal },
        { role: "user", content: prompt }
      ],
      temperature: pediuMapa ? 0.3 : 0.7,
    });

    const resposta = completion.choices[0]?.message?.content || "";

    // 4. Retorna a resposta E os links dos livros para o Front mostrar os cards
    return new Response(JSON.stringify({ 
      resposta, 
      fontesLab: livros // Isso aqui vai fazer o card do livro aparecer no chat!
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
