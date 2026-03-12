import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap } from "lucide-react";
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
  const [isFocused, setIsFocused] = useState(false);
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
    <div className="flex h-screen bg-background overflow-hidden font-sans relative selection:bg-primary/30">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

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

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-white/5 z-20 bg-background/40 backdrop-blur-xl">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-muted-foreground"><Menu size={20} /></button>
          
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]"></span>
            </div>
            <h1 className="text-sm font-bold font-mono tracking-widest text-primary uppercase">Neural AI // Aura V6</h1>
          </div>

          <button onClick={() => {
            const id = Date.now().toString();
            setConversations(prev => [{ id, title: "Nova conversa", messages: [], createdAt: new Date() }, ...prev]);
            setActiveConvId(id);
          }} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground"><Plus size={20} /></button>
        </header>

        <main className="flex-1 overflow-y-auto chat-scrollbar relative scroll-smooth">
          {!hasMessages ? (
            <div className="flex flex-col items-center justify-center h-full">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-[300px] h-[300px] flex items-center justify-center mb-8 drop-shadow-[0_0_30px_rgba(var(--primary),0.2)]"
              >
                <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={audioAnalyzer.isProcessing} size="md" />
              </motion.div>
              <h2 className="text-3xl font-light mb-2 tracking-tight text-foreground/90">Como posso ajudar?</h2>
              <p className="text-muted-foreground font-mono text-[10px] uppercase tracking-[0.4em] opacity-40 italic">Lab Neuro-UNINTA // Assistant Online</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full py-10 px-6 space-y-2">
              <AnimatePresence mode="popLayout">
                {messages.map((msg) => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shadow-lg border border-primary/20 shrink-0">
                        <Zap size={16} className="text-primary animate-pulse" />
                      </div>
                    )}
                    <div className={`p-5 rounded-2xl max-w-[85%] text-sm leading-relaxed backdrop-blur-md border shadow-xl ${msg.role === "user" ? "bg-primary text-primary-foreground border-primary/30" : "bg-white/5 border-white/10 text-foreground/90"}`}>
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

        <footer className="p-8 bg-gradient-to-t from-background via-background/90 to-transparent">
          <div className="max-w-4xl mx-auto relative space-y-4">
            
            {/* --- HUD ANIMADO - GRADE DE ENERGIA REATIVA --- */}
            <AnimatePresence>
              {isFocused && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.4 }}
                  className="absolute -inset-1.5 pointer-events-none rounded-[2rem] border border-primary/30 shadow-[0_0_30px_rgba(var(--primary),0.15)] bg-primary/5"
                >
                  <motion.div 
                    animate={{ x: ["0%", "100%", "0%"] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                    className="absolute -top-[1px] left-1/4 h-[1px] w-1/2 bg-gradient-to-r from-transparent via-primary to-transparent"
                  />
                  <motion.div 
                    animate={{ y: ["0%", "100%", "0%"] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="absolute top-1/4 -left-[1px] w-[1px] h-1/2 bg-gradient-to-b from-transparent via-primary to-transparent"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Input com efeito de Vidro */}
            <div className={`flex items-end gap-3 bg-white/5 border border-white/10 rounded-[1.75rem] p-3 focus-within:bg-black/40 focus-within:border-primary/50 focus-within:shadow-[0_0_20px_rgba(var(--primary),0.1)] transition-all duration-500 backdrop-blur-2xl`}>
              <button 
                onClick={toggleVoice} 
                className={`p-3 rounded-2xl transition-all ${audioAnalyzer.isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5"}`}
              >
                {audioAnalyzer.isActive ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              
              <textarea 
                ref={textareaRef} 
                value={input} 
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown} 
                placeholder="Injete um comando neural..." 
                rows={1} 
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none text-sm py-2 placeholder:text-muted-foreground/30 font-sans max-h-[200px]" 
              />
              
              <button 
                onClick={handleSend} 
                disabled={!input.trim() || isTyping} 
                className="p-3 bg-primary text-primary-foreground rounded-2xl disabled:opacity-20 active:scale-90 shadow-lg group"
              >
                {isTyping ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                )}
              </button>
            </div>
            
            <p className="text-center text-[9px] text-muted-foreground/30 font-mono uppercase tracking-[0.4em]">
              Protocol Aura 6.0 // Neural Interface
            </p>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-background/98 backdrop-blur-3xl flex flex-col items-center justify-center">
            <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={audioAnalyzer.isProcessing} />
            <div className="mt-16 flex flex-col items-center gap-6">
              <p className="font-mono text-xs tracking-widest text-primary animate-pulse uppercase">Ouvindo núcleo neural...</p>
              <button onClick={toggleVoice} className="p-6 rounded-full bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white transition-all"><MicOff size={28} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
