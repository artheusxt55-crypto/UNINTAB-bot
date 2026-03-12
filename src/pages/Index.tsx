import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, BrainCircuit, User, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
// Importando seu motor neural
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

  // Efeito de auto-scroll para manter a conversa visível
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // Lógica de Login: Se não tem ID, o primeiro input vira o ID
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
      // 1. Busca histórico do Redis para contexto (Memória de longo prazo)
      const historico = await buscarDoRedis(userId);
      const contexto = `Você é a Aura AI, assistente do Lab Neuro-UNINTA. Mestre: Matheus. Operador: ${userId}. Histórico recente: ${historico.join(" | ")}`;

      // 2. Chama a Groq (Cérebro)
      const respostaIA = await analisarComGroq(userMsg, contexto);

      // 3. Salva no Redis (Memória de curto prazo)
      await salvarNoRedis(userId, `U: ${userMsg} | B: ${respostaIA}`);

      // 4. Exibe na Interface e Ativa a Voz
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
    <div className="flex flex-col h-screen bg-[#050505] text-slate-100 font-sans selection:bg-red-500/30">
      {/* Header Futurista do Lovable */}
      <header className="h-16 border-b border-white/5 bg-black/40 backdrop-blur-xl flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
            <div className="absolute inset-0 w-3 h-3 bg-red-600 rounded-full animate-ping opacity-50" />
          </div>
          <span className="text-xs font-bold tracking-[0.2em] uppercase text-white/80">
            Aura <span className="text-red-600">Neural</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-medium text-slate-400">
            OPERADOR: {userId?.toUpperCase() || "NÃO_IDENTIFICADO"}
          </div>
        </div>
      </header>

      {/* Área de Chat com ScrollArea do Shadcn */}
      <main className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full p-4 md:p-8">
          <div className="max-w-3xl mx-auto space-y-8">
            <AnimatePresence initial={false}>
