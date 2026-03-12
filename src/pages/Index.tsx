import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, BrainCircuit, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { analisarComGroq, salvarNoRedis, buscarDoRedis, falarTexto } from "@/lib/aura-engine";

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    if (!userId) {
      const newId = input.trim().toLowerCase();
      setUserId(newId);
      localStorage.setItem("untbot_last_id", newId);
      setMessages([{ role: "bot", content: `>> [SISTEMA]: ID ${newId.toUpperCase()} RECONHECIDO. CONEXÃO NEURAL ESTABELECIDA.` }]);
      setInput("");
      return;
    }

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const historico = await buscarDoRedis(userId);
      const contexto = `Você é a Aura AI, assistente do Lab Neuro-UNINTA. Mestre: Matheus. Operador: ${userId}. Histórico recente: ${historico.join(" | ")}`;
      const respostaIA = await analisarComGroq(userMsg, contexto);
      await salvarNoRedis(userId, `U: ${userMsg} | B: ${respostaIA}`);
      setMessages((prev) => [...prev, { role: "bot", content: respostaIA }]);
      falarTexto(respostaIA);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro na Matriz",
        description: "Não foi possível processar o comando neural.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-slate-100 font-sans">
      <header className="h-16 border-b border-white/5 bg-black/40 backdrop-blur-xl flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
          <span className="text-xs font-bold tracking-[0.2em] uppercase text-white/80">
            Aura <span className="text-red-600">Neural</span>
          </span>
        </div>
        <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-slate-400">
          ID: {userId?.toUpperCase() || "RESTRITO"}
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full p-4 md:p-8">
          <div className="max-w-3xl mx-auto space-y-8">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    msg.role === "bot" ? "bg-red-600/10 border-red-500/20 text-red-500" : "bg-white/5 border-white/10 text-slate-400"
                  }`}>
                    {msg.role === "bot" ? <BrainCircuit size={20} /> : <User size={20} />}
                  </div>
                  <div className={`p-4 rounded-2xl text-sm border ${
                    msg.role === "bot" ? "bg-white/[0.02] border-white/5 text-slate-200" : "bg-red-600 text-white"
                  }`}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </main>

      <footer className="p-4 md:p-8 bg-gradient-to-t from-black to-transparent">
        <div className="max-w-3xl mx-auto flex gap-2 p-2 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-2xl">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder={!userId ? "Digite seu ID de acesso..." : "Injete um comando..."}
            className="bg-transparent border-none focus-visible:ring-0 text-slate-200"
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            className="bg-red-600 hover:bg-red-500 text-white rounded-xl"
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default Index;
