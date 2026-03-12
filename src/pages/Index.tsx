// 1. Importe os motores que criamos no aura-engine
import { analisarComGroq, salvarNoRedis, buscarDoRedis, falarTexto } from "@/lib/aura-engine";

// ... dentro do componente Index ...

const handleSendMessage = async (text: string) => {
  // Pega o ID do usuário (ou usa um padrão para não dar erro)
  const userId = localStorage.getItem("untbot_last_id") || "operador_neural";

  try {
    // AURA PENSA: Busca histórico e manda pra Groq
    const historico = await buscarDoRedis(userId);
    const contexto = `Você é o Uninta Bot do Lab Neuro-UNINTA. Mestre: Matheus. Operador: ${userId}. Histórico: ${historico.join(" | ")}`;
    
    const respostaIA = await analisarComGroq(text, contexto);

    // AURA LEMBRA: Salva no Redis
    await salvarNoRedis(userId, `U: ${text} | B: ${respostaIA}`);

    // AURA FALA: Ativa a voz neural
    falarTexto(respostaIA);

    // RETORNA para a interface do Lovable exibir o balãozinho
    return respostaIA; 
  } catch (error) {
    console.error("Erro na sinapse:", error);
    return "Erro crítico na matriz neural. Verifique as chaves.";
  }
};
