import { Groq } from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY,
});

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  try {
    const { prompt, contexto } = await req.json();

    // Verifica se o usuário pediu um mapa mental no prompt
    const pediuMapa = prompt.toLowerCase().includes("mapa mental");

    const diretrizFinal = pediuMapa 
      ? `${contexto} 
         PROTOCOLO DE MAPA MENTAL (ATIVADO):
         1. Formate como um MAPA MENTAL técnico.
         2. PROIBIDO o uso de asteriscos (**), hashtags (#) ou Markdown.
         3. Use LETRAS MAIÚSCULAS para os tópicos principais.
         4. Use apenas hifens (-) e recuos para os detalhes.`
      : contexto; // Se não pediu mapa, usa apenas o contexto normal

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: diretrizFinal },
        { role: "user", content: prompt }
      ],
      temperature: pediuMapa ? 0.3 : 0.7, // Mais preciso para mapas, mais natural para chat
    });

    const resposta = completion.choices[0]?.message?.content || "";

    return new Response(JSON.stringify({ resposta }), {
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
