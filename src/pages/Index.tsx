import { useState, useEffect, useRef } from "react";
import { analisarComGroq, salvarNoRedis, buscarDoRedis, falarTexto } from "@/lib/aura-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Send, BrainCircuit, User } from "lucide-react";

interface Message {
  role: "bot" | "user";
  content: string;
}

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(localStorage.getItem("untbot_last_id"));
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    // Se for o primeiro acesso, o input vira o ID do usuário
    if (!userId) {
      const newId = input.trim().toLowerCase();
      setUserId(newId);
      localStorage.setItem("untbot_last_id", newId);
      setMessages([{ role: "bot", content: `>> [SISTEMA]: ID ${newId.toUpperCase()} CADASTRADO NO NÚCLEO. COMO POSSO AJUDAR, MESTRE?` }]);
      setInput("");
      return;
    }

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      // 1. Busca histórico para contexto
      const historico = await buscarDoRedis(userId);
      const contexto = `Você é a Aura AI, assistente do Lab Neuro-UNINTA. Mestre: Matheus. Operador: ${userId}. Histórico: ${historico.join(" | ")}`;

      // 2. Processamento Neural (Groq)
      const resposta = await analisarComGroq(userMsg, contexto);

      // 3. Memória (Redis)
      await salvarNoRedis(userId, `U: ${userMsg} | B: ${resposta}`);

      // 4. Feedback Visual e Voz
      setMessages((prev) => [...prev, { role: "bot", content: resposta }]);
      falarTexto(resposta);

    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro Crítico",
        description: "Falha na sinapse neural. Verifique as chaves da Groq.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white font-mono scanline">
      {/* Header Estilo Lab */}
      <header className="p-4 border-b border-red-900/40 bg-black/80 backdrop-blur-md flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_8px_#e30613]" />
          <span className="text-xs font-bold tracking-widest uppercase">
            NEURO-UNINTA <span className="text-red-600">AURA_V6</span>
          </span>
        </div>
        <div className="text-[10px] text-red-500 bg-red-950/20 px-2 py-1 rounded border border-red-900/50">
          ID: {userId?.toUpperCase() || "AGUARDANDO_AUTENTICAÇÃO"}
        </div>
      </header>

      {/* Área do Chat */}
      <ScrollArea className="flex-1 p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && !userId && (
            <div className="text-center py-20 animate-in fade-in slide-in-from-bottom-4">
              <BrainCircuit className="w-16 h-16 mx-auto text-red-600 mb-4 opacity-50" />
              <h2 className="text-xl font-bold mb-2">SISTEMA AURA ONLINE</h2>
              <p className="text-gray-500 text-sm">INJETE SEU ID DE OPERADOR PARA INICIAR</p>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                msg.role === "bot" ? "border-red-600 bg-red-950/20" : "border-gray-600 bg-gray-900"
              }`}>
                {msg.role === "bot" ? <BrainCircuit size={16} className="text-red-500" /> : <User size={16} />}
              </div>
              <div className={`max-w-[80%] p-4 rounded-lg text-sm leading-relaxed border ${
                msg.role === "bot" 
                  ? "bg-red-950/10 border-red-900/30 text-red-50" 
                  : "bg-gray-900/50 border-gray-800 text-gray-300"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input de Comando */}
      <div className="p-4 bg-black border-t border-red-900/20">
        <div className="max-w-3xl mx-auto flex gap-2 relative">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={!userId ? "Digite seu ID de acesso..." : "Injete o comando neural..."}
            className="bg-gray-950 border-red-900/50 focus:border-red-600 text-red-50"
            disabled={isLoading}
          />
          <Button 
            onClick={handleSend} 
            disabled={isLoading}
            className="bg-red-700 hover:bg-red-600 text-white transition-all"
          >
            {isLoading ? <Loader2 className="animate-spin" /> : <Send size={18} />}
          </Button>
          {isLoading && (
            <div className="absolute -top-1 left-0 h-[1px] bg-red-600 animate-pulse w-full" />
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
