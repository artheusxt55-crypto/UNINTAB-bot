import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, BrainCircuit, User, Loader2, Sparkles, Shield, Cpu, Zap } from "lucide-react";
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
      setMessages([{ role: "bot", content: `>> [PROTOCOLO ATIVADO]: OPERADOR ${newId.toUpperCase()} IDENTIFICADO. ACESSO AO NÚCLEO AUTORIZADO.` }]);
      setInput("");
      return;
    }

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const historico = await buscarDoRedis(userId);
      const contexto = `Você é a Aura AI, a interface neural do Lab Neuro-UNINTA. Mestre: Matheus. Operador: ${userId}. Responda de forma técnica, inteligente e futurista. Histórico: ${historico.join(" | ")}`;
      
      const respostaIA = await analisarComGroq(userMsg, contexto);
      
      await salvarNoRedis(userId, `U: ${userMsg} | B: ${respostaIA}`);
      
      setMessages((prev) => [...prev, { role: "bot", content: respostaIA }]);
      
      // Ativa a síntese de voz neural
      falarTexto(respostaIA);
      
    } catch (error) {
      toast({
        variant: "destructive",
        title: "FALHA CRÍTICA",
        description: "A conexão com a matriz neural foi interrompida.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#020202] text-slate-100 font-sans selection:bg-red-500/30 overflow-hidden relative">
      {/* CAMADAS DE EFEITO ORIGINAIS */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none z-0"></div>
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-900/10 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* HEADER ORIGINAL COM GLASSMORPHISM */}
      <header className="h-20 border-b border-white/5 bg-black/40 backdrop-blur-2xl flex items-center justify-between px-8 z-50 relative">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-4 h-4 bg-red-600 rounded-full animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.8)]" />
            <div className="absolute inset-0 w-4 h-4 bg-red-600 rounded-full animate-ping opacity-20" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black tracking-[0.4em] uppercase text-red-500/60 leading-tight">System Status: Online</span>
            <span className="text-xl font-black tracking-tighter uppercase text-white flex items-center gap-2">
              Aura <span className="text-red-600">Neural</span> <span className="text-[10px] bg-red-600/20 text-red-500 px-2 py-0.5 rounded border border-red-500/30">V.6.0</span>
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Neural Link Active</span>
            <span className="text-[11px] font-mono text-slate-300">OP_ID: {userId?.toUpperCase() || "PENDING"}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Cpu size={20} className="text-red-500 animate-spin-slow" />
          </div>
        </div>
      </header>

      {/* CHAT COM ANIMAÇÕES DE ENTRADA */}
      <main className="flex-1 overflow-hidden relative z-10">
        <ScrollArea className="h-full px-6 py-10">
          <div className="max-w-5xl mx-auto space-y-12">
            <AnimatePresence mode="popLayout">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className={`flex gap-6 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border transition-transform hover:scale-105 shadow-2xl ${
                    msg.role === "bot" 
                    ? "bg-gradient-to-br from-red-600/30 to-black border-red-500/40 text-red-500 shadow-red-900/10" 
                    : "bg-gradient-to-br from-slate-800 to-black border-white/10 text-slate-400"
                  }`}>
                    {msg.role === "bot" ? <BrainCircuit size={28} /> : <User size={28} />}
                  </div>
                  
                  <div className={`relative max-w-[75%] p-6 rounded-[2rem] border backdrop-blur-md ${
                    msg.role === "bot" 
                    ? "bg-white/[0.03] border-white/10 text-slate-100 rounded-tl-none" 
                    : "bg-red-600 border-red-500 text-white rounded-tr-none shadow-[0_15px_40px_-10px_rgba(220,38,38,0.4)]"
                  }`}>
                    <div className="text-base leading-[1.6] font-medium tracking-tight whitespace-pre-wrap">{msg.content}</div>
                    {msg.role === "bot" && (
                      <div className="absolute -right-3 -top-3 w-8 h-8 bg-black border border-white/10 rounded-full flex items-center justify-center">
                        <Sparkles className="text-red-500" size={14} />
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={scrollRef} className="h-10" />
          </div>
        </ScrollArea>
      </main>

      {/* INPUT BAR ORIGINAL (DESIGN INTEGRADO) */}
      <footer className="p-8 md:p-12 relative z-20 bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="max-w-4xl mx-auto relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-red-600/20 to-blue-600/20 rounded-[2.5rem] blur-xl opacity-50 group-focus-within:opacity-100 transition-opacity"></div>
          
          <div className="relative overflow-hidden bg-black/60 border border-white/10 p-3 rounded-[2rem] backdrop-blur-3xl focus-within:border-red-500/50 transition-all duration-500 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-red-500/40">
                <Zap size={20} />
              </div>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder={!userId ? "SISTEMA BLOQUEADO. INSIRA CREDENCIAIS..." : "Envie um comando para a Aura..."}
                className="bg-transparent border-none focus-visible:ring-0 text-white placeholder:text-slate-600 h-14 text-lg font-medium"
                disabled={isLoading}
              />
              <Button
                onClick={handleSendMessage}
                disabled={isLoading || !input.trim()}
                className={`h-14 w-14 rounded-2xl transition-all duration-500 ${
                  isLoading ? 'bg-slate-900' : 'bg-red-600 hover:bg-red-500 hover:shadow-[0_0_30px_rgba(220,38,38,0.6)]'
                } text-white shrink-0`}
              >
                {isLoading ? <Loader2 className="animate-spin" size={24} /> : <Send size={24} />}
              </Button>
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-6 px-4">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[9px] uppercase tracking-[0.5em] text-white/30 font-bold">Encrypted Connection</span>
            </div>
            <span className="text-[9px] uppercase tracking-[0.5em] text-white/30 font-bold italic underline decoration-red-900/50 underline-offset-8">Lab Neuro-UNINTA // 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
