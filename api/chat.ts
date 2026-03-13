import { Groq } from "groq-sdk";

// No back-end do Vercel, usamos process.env e não import.meta.env
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY,
});

export const config = {
  runtime: 'edge', // Otimiza para velocidade máxima
};

export default async function handler(req: Request) {
  try {
    const { prompt, contexto } = await req.json();

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: contexto },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
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
