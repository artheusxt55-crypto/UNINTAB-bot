import { Groq } from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

// 1. Conexão com a Biblioteca (Supabase)
// Usando as variáveis que você acabou de configurar na Vercel
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

// 2. Configuração da IA (Groq)
// Tenta a KEY 1 ou a KEY 2 (ajustado para bater com seu print da Vercel)
const groq = new Groq({
  apiKey: process.env.VITE_GROQ_API_KEY || process.env.VITE_GROQ_API_KEY2 || process.env.GROQ_API_KEY,
});

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  try {
    const { prompt, contexto } = await req.json();

    // 3. BUSCA NOS 195 LIVROS DO LAB
    // Filtramos o prompt para pegar o termo principal (ex: TDAH, Autismo, USP...)
    const palavras = prompt.split(' ').filter((p: string) => p.length > 3);
    const termoBusca = palavras[0] || prompt;
    
    const { data: livros } = await supabase
      .from('biblioteca')
      .select('titulo, conteudo_trecho, url_pdf')
      .ilike('conteudo_trecho', `%${termoBusca}%`)
      .limit(2);

    // Formatamos o conhecimento técnico para a IA
    const infoLivros = livros?.length 
      ? livros.map(l => `[FONTE OFICIAL LAB: ${l.titulo}]: ${l.conteudo_trecho}`).join("\n") 
      : "Não encontrei trechos específicos nos livros do Lab para este termo, responda com sua base geral.";

    // 4. LÓGICA DE MAPA MENTAL (Preservando seu protocolo original)
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
    // Devolvemos a resposta da IA e os metadados dos livros para os cards
    return new Response(JSON.stringify({ 
      resposta, 
      fontesLab: livros 
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
