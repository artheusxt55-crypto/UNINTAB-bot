import { createClient } from '@supabase/supabase-js';

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// 1. Inicializa o Supabase (garanta que as variáveis abaixo estejam no seu .env)
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

async function buscarNosLivros(pergunta: string) {
  try {
    // Busca simples por texto nas colunas de título e conteúdo
    const { data: livros } = await supabase
      .from('biblioteca')
      .select('titulo, conteudo_trecho')
      .ilike('conteudo_trecho', `%${pergunta.split(' ')[0]}%`) // Pega a primeira palavra como filtro inicial
      .limit(2);

    if (!livros || livros.length === 0) return "";

    // Organiza os trechos para a Aura ler
    const contexto = livros.map(l => `Referência Livro [${l.titulo}]: ${l.conteudo_trecho}`).join("\n\n");
    return `\n\nUSE ESTAS REFERÊNCIAS DA NOSSA BIBLIOTECA SE FOR ÚTIL:\n${contexto}`;
  } catch (e) {
    console.error("Erro na busca da biblioteca:", e);
    return "";
  }
}

async function tryGroq(apiKey: string, prompt: string, systemContext: string) {
  if (!apiKey) return null;

  // 2. Busca o conhecimento extra antes de enviar para a IA
  const informacaoDosLivros = await buscarNosLivros(prompt);
  const contextoFinal = systemContext + informacaoDosLivros;

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: contextoFinal }, // Aqui a Aura recebe o "estudo" do livro
          { role: "user", content: prompt }
        ],
        temperature: 0.7 // Mantém ela criativa e natural no bate-papo
      })
    });
    return response;
  } catch (e) {
    return null;
  }
}

export const analisarComGroq = async (prompt: string, systemContext: string = "Você é a Aura, a IA oficial do Lab Neuro-UNINTA. Responda de forma acolhedora.") => {
  const key1 = import.meta.env.VITE_GROQ_API_KEY;
  const key2 = import.meta.env.VITE_GROQ_API_KEY2;

  let result = await tryGroq(key1, prompt, systemContext);

  if (!result || result.status !== 200) {
    result = await tryGroq(key2, prompt, systemContext);
  }

  if (!result || result.status !== 200) {
    throw new Error("Falha na sinapse neural: as chaves Groq falharam.");
  }

  const data = await result.json();
  return data.choices[0]?.message?.content || "";
};
