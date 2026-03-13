const handleSend = async () => {
  if (!input.trim() || isTyping) return;
  const userMsg = input.trim();
  
  addMessage("user", userMsg);
  setInput("");
  setIsTyping(true);

  try {
    const idParaBusca = userId || userMsg.toLowerCase();
    const historico = await buscarDoRedis(idParaBusca);
    const contextoBase = `Operador: ${idParaBusca}. Histórico recente: ${historico.join(" | ")}`;

    // 1. Obtém a resposta estruturada com símbolos e links
    const respostaCompleta = await analisarComContextoHibrido(userMsg, contextoBase);
    
    // 2. SALVA E EXIBE (Mantém o Markdown com asteriscos para o utilizador ver)
    await salvarNoRedis(idParaBusca, `U: ${userMsg} | B: ${respostaCompleta}`);
    addMessage("assistant", respostaCompleta);

    // 3. LIMPEZA PARA A VOZ (Remove asteriscos, hashtags e links para a Aura não os ler)
    const textoLimpoParaVoz = respostaCompleta
      .replace(/\*\*/g, '') // Remove negritos
      .replace(/#/g, '')    // Remove hashtags de títulos
      .replace(/\[.*\]\(.*\)/g, 'fonte citada') // Substitui links por "fonte citada"
      .split('---')[0];     // Faz a voz parar antes de chegar à lista de links do rodapé

    falarTexto(textoLimpoParaVoz);

  } catch (error) {
    addMessage("assistant", "⚠️ Erro na conexão com as fontes externas.");
  } finally {
    setIsTyping(false);
  }
};
