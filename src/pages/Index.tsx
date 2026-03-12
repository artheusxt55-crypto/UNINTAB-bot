import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu } from "lucide-react";
import ReactMarkdown from "react-markdown";
import NeuralOrb from "./NeuralOrb";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";
import ChatSidebar from "./ChatSidebar";
// IMPORTAÇÃO DO MOTOR AURA
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

export default function ChatInterface() {
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

  const activeConversation = conversations.find((c) => c.id === activeConvId)!;
  const messages = activeConversation?.messages || [];

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

  // --- LÓGICA DE ENVIO CONECTADA À GROQ E REDIS ---
  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = input.trim();
    const userId = "untbot_lab_user"; // ID fixo ou você pode puxar de um estado
    
    addMessage("user", userMsg);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setIsTyping(true);

    try {
      // 1. Busca memória no Redis
      const historico = await buscarDoRedis(userId);
      
      // 2. Prepara o contexto para a Groq
      const contexto = `Você é a Aura AI do Lab Neuro-UNINTA. Mestre: Matheus. Seja técnico e use Markdown. Histórico: ${historico.join(" | ")}`;
      
      // 3. Obtém resposta da IA real
      const resposta = await analisarComGroq(userMsg, contexto);
      
      // 4. Salva a nova interação no Redis
      await salvarNoRedis(userId, `U: ${userMsg} | B: ${resposta}`);
      
      // 5. Exibe na tela e fala (Gradio)
      addMessage("assistant", resposta);
      falarTexto(resposta);

    } catch (error) {
      addMessage("assistant", "⚠️ Erro de conexão com o núcleo neural. Verifique as chaves de API.");
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

  const handleNewConversation = () => {
    const id = Date.now().toString();
    setConversations((prev) => [{ id, title: "Nova conversa", messages: [], createdAt: new Date() }, ...prev]);
    setActiveConvId(id);
    setSidebarOpen(false);
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
    <div className="flex h-screen bg-background overflow-hidden">
      <ChatSidebar
        conversations={conversations}
        activeConvId={activeConvId}
        onSelect={(id) => { setActiveConvId(id); setSidebarOpen(false); }}
        onNew={handleNewConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <Menu size={20} />
          </button>
          <button onClick={handleNewConversation} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground" title="Nova conversa">
            <Plus size={20} />
          </button>
          <h1 className="text-sm font-medium text-foreground/80 font-mono tracking-wider">NEURAL AI</h1>
        </header>

        <div className="flex-1 overflow-y-auto chat-scrollbar">
          {!hasMessages ? (
            <div className="flex flex-col items-center justify-center h-full px-4">
              <div className="relative w-[300px] h-[300px] flex items-center justify-center mb-8">
                <AnimatePresence>
                  {showVoiceOrb ? (
                    <NeuralOrb
                      isActive={audioAnalyzer.isActive}
                      volume={audioAnalyzer.volume}
                      frequency={audioAnalyzer.frequency}
                      isProcessing={audioAnalyzer.isProcessing}
                      size="md"
                    />
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-20 h-20 rounded-full flex items-center justify-center neural-glow-subtle"
                      style={{
                        background: "radial-gradient(circle, hsl(var(--neural-red) / 0.2) 0%, hsl(var(--neural-crimson) / 0.1) 50%, transparent 70%)",
                      }}
                    >
                      <div className="w-3 h-3 rounded-full bg-primary animate-pulse-glow" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <h2 className="text-xl font-medium text-foreground/90 mb-2">Como posso ajudar?</h2>
              <p className="text-sm text-muted-foreground font-mono tracking-wide">Interface Aura V6 Online</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full py-6 px-4">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`mb-6 ${msg.role === "user" ? "flex justify-end" : ""}`}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-3 bg-chat-user text-foreground text-sm leading-relaxed border border-white/5">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full mt-1 flex items-center justify-center neural-glow-subtle" style={{ background: "hsl(var(--neural-red) / 0.15)" }}>
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      </div>
                      <div className="prose prose-invert prose-sm max-w-none text-foreground/90 leading-relaxed">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex gap-3 mb-6">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full mt-1 flex items-center justify-center neural-glow-subtle" style={{ background: "hsl(var(--neural-red) / 0.15)" }}>
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                  <TypingIndicator />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="p-4 pb-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-chat-input border border-border/50 rounded-2xl px-4 py-3 focus-within:border-primary/30 transition-colors">
              <button
                onClick={toggleVoice}
                className={`flex-shrink-0 p-2 rounded-lg transition-colors ${audioAnalyzer.isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              >
                {audioAnalyzer.isActive ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Envie uma mensagem..."
                rows={1}
                className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground/50 font-sans max-h-[200px]"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="flex-shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
              >
                {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <p className="text-center text-xs text-muted-foreground/40 mt-3 font-mono uppercase tracking-widest">
              Lab Neuro-UNINTA // Aura Engine
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showVoiceOrb && hasMessages && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "hsl(var(--background) / 0.9)", backdropFilter: "blur(20px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex flex-col items-center">
              <div className="w-[400px] h-[400px] flex items-center justify-center">
                <NeuralOrb
                  isActive={audioAnalyzer.isActive}
                  volume={audioAnalyzer.volume}
                  frequency={audioAnalyzer.frequency}
                  isProcessing={audioAnalyzer.isProcessing}
                />
              </div>
              <motion.p className="text-sm font-mono tracking-widest text-muted-foreground mt-4 animate-pulse">
                {audioAnalyzer.isProcessing ? "processando..." : "ouvindo..."}
              </motion.p>
              <motion.button
                onClick={toggleVoice}
                className="mt-8 p-3 rounded-full bg-muted/30 border border-border/30 text-muted-foreground hover:bg-destructive/20 transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <MicOff size={20} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
