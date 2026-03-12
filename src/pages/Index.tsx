import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import NeuralOrb from "@/components/NeuralOrb";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";
import ChatSidebar from "@/components/ChatSidebar";
import { analisarComGroq, salvarNoRedis, buscarDoRedis, falarTexto } from "@/lib/aura-engine";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-primary/60"
          animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export default function Index() {
  const [conversations, setConversations] = useState<Conversation[]>([
    { id: "1", title: "Nova conversa", messages: [], createdAt: new Date() },
  ]);
  const [activeConvId, setActiveConvId] = useState("1");
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showVoiceOrb, setShowVoiceOrb] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  const activeConversation = conversations.find((c) => c.id === activeConvId) || conversations[0];
  const messages = activeConversation.messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  const addMessage = (role: "user" | "assistant", content: string) => {
    const msg: Message = { id: Date.now().toString() + Math.random(), role, content, timestamp: new Date() };
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConvId) return c;
        const updated = { ...c, messages: [...c.messages, msg] };
        if (role === "user" && c.messages.length === 0) {
          updated.title = content.slice(0, 40) + (content.length > 40 ? "..." : "");
        }
        return updated;
      })
    );
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = input.trim();
    const userId = "untbot_user";
    
    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);

    try {
      const historico = await buscarDoRedis(userId);
      const contexto = `Você é a Aura AI do Lab Neuro-UNINTA. Mestre: Matheus. Responda de forma técnica e futurista. Histórico recente: ${historico.join(" | ")}`;
      const resposta = await analisarComGroq(userMsg, contexto);
      
      await salvarNoRedis(userId, `U: ${userMsg} | B: ${resposta}`);
      addMessage("assistant", resposta);
      falarTexto(resposta);
    } catch (error) {
      addMessage("assistant", "⚠️ Erro de conexão com o núcleo neural.");
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleVoice = () => {
    if (audioAnalyzer.isActive) {
      audioAnalyzer.stop();
      setShowVoiceOrb(false);
    } else {
      audioAnalyzer.start();
      setShowVoiceOrb(true);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
      <ChatSidebar
        conversations={conversations}
        activeConvId={activeConvId}
        onSelect={(id) => { setActiveConvId(id); setSidebarOpen(false); }}
        onNew={() => {
          const id = Date.now().toString();
          setConversations(prev => [{ id, title: "Nova conversa", messages: [], createdAt: new Date() }, ...prev]);
          setActiveConvId(id);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border/50 z-20 bg-background/80 backdrop-blur-md">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-muted text-muted-foreground"><Menu size={20} /></button>
          <button onClick={() => {
            const id = Date.now().toString();
            setConversations(prev => [{ id, title: "Nova conversa", messages: [], createdAt: new Date() }, ...prev]);
            setActiveConvId(id);
          }} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Plus size={20} /></button>
          <h1 className="text-sm font-bold font-mono tracking-widest text-primary uppercase">Neural AI // Aura V6</h1>
        </header>

        <main className="flex-1 overflow-y-auto chat-scrollbar relative z-10">
          {!hasMessages ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-[300px] h-[300px] flex items-center justify-center mb-8">
                <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={audioAnalyzer.isProcessing} size="md" />
              </div>
              <h2 className="text-xl font-medium mb-2">Como posso ajudar?</h2>
              <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest italic">Lab Neuro-UNINTA // Assistant Online</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full py-10 px-6">
              <AnimatePresence mode="popLayout">
                {messages.map((msg) => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`mb-8 ${msg.role === "user" ? "flex justify-end" : "flex gap-4"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shadow-lg border border-primary/20 shrink-0"><div className="w-2 h-2 rounded-full bg-primary animate-pulse" /></div>
                    )}
                    <div className={`p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground shadow-xl" : "bg-muted/50 border border-border/50 text-foreground"}`}>
                      <ReactMarkdown className="prose prose-invert prose-sm max-w-none">{msg.content}</ReactMarkdown>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {isTyping && <div className="flex gap-4 mb-8"><div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-primary animate-pulse" /></div><TypingIndicator /></div>}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <footer className="p-4 bg-gradient-to-t from-background to-transparent z-20">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-muted/50 border border-border/50 rounded-2xl p-3 focus-within:border-primary/50 transition-all shadow-2xl backdrop-blur-xl">
              <button onClick={toggleVoice} className={`p-2 rounded-xl transition-all ${audioAnalyzer.isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background"}`}>
                {audioAnalyzer.isActive ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Injete um comando..." rows={1} className="flex-1 bg-transparent border-none focus:ring-0 resize-none text-sm py-2" />
              <button onClick={handleSend} disabled={!input.trim() || isTyping} className="p-2 bg-primary text-primary-foreground rounded-xl disabled:opacity-20 transition-transform active:scale-95">
                {isTyping ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground/30 mt-3 font-mono uppercase tracking-[0.3em]">
              Protocol Aura 6.0 // Neural Interface Activated
            </p>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-3xl flex flex-col items-center justify-center">
            <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={audioAnalyzer.isProcessing} />
            <div className="mt-10 flex flex-col items-center gap-4">
              <p className="font-mono text-xs tracking-widest text-primary animate-pulse uppercase">
                {audioAnalyzer.isProcessing ? "Sincronizando..." : "Ouvindo Redes Neurais..."}
              </p>
              <button onClick={toggleVoice} className="p-5 bg-destructive/20 text-destructive border border-destructive/20 rounded-full hover:bg-destructive hover:text-white transition-all shadow-2xl shadow-destructive/20"><MicOff size={28} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
