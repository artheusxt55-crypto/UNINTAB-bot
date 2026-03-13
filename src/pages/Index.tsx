import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import NeuralOrb from "@/components/NeuralOrb";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";
import ChatSidebar from "@/components/ChatSidebar";
import { analisarComGroq, salvarNoRedis, buscarDoRedis, falarTexto } from "@/lib/aura-engine";
import { jsPDF } from "jspdf";

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
  const [userId, setUserId] = useState<string>(""); 

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  useEffect(() => {
    const savedId = localStorage.getItem('untbot_last_id');
    if (savedId) setUserId(savedId);
  }, []);

  // --- MOTOR GRÁFICO DE INFOGRÁFICOS (AURA PDF ENGINE V7) ---
  const exportarParaPDF = (texto: string) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 1. Limpeza de formatação Markdown
    const textoLimpo = texto.replace(/[*#`_]/g, '').trim();
    const linhas = textoLimpo.split('\n').filter(l => l.trim() !== "");

    // 2. Estilização de Fundo e Margens
    doc.setFillColor(248, 249, 250); // Fundo cinza claríssimo
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFillColor(227, 6, 19); // Barra lateral UNINTA
    doc.rect(0, 0, 4, pageHeight, 'F');

    // Cabeçalho Profissional
    doc.setTextColor(227, 6, 19);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("MAPA MENTAL NEURAL", 15, 22);
    
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`PROTOCOLO AURA AI | LAB NEURO-UNINTA | OPERADOR: ${userId.toUpperCase() || 'UNTBOT'}`, 15, 29);
    doc.text(`EMISSÃO: ${new Date().toLocaleDateString()} - ${new Date().toLocaleTimeString()}`, 15, 33);

    let cursorY = 48;
    const startX = 15;

    linhas.forEach((linha) => {
      // Identifica o nível de hierarquia pelo recuo (espaços à esquerda)
      const recuo = linha.search(/\S/); 
      const textoFinal = linha.trim();
      
      if (recuo === 0) {
        // TÓPICO PRINCIPAL (BALÃO DESTAQUE)
        cursorY += 6;
        doc.setFillColor(227, 6, 19); // Vermelho
        doc.roundedRect(startX, cursorY - 7, pageWidth - 35, 11, 2, 2, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(textoFinal.toUpperCase(), startX + 5, cursorY);
        cursorY += 14;
      } else {
        // SUB-TÓPICOS COM SETAS E CARDS (ESTILO INFOGRÁFICO)
        const indentLevel = Math.min(recuo * 2, 25);
        const cardWidth = pageWidth - (startX + indentLevel + 30);
        
        // Desenha a Seta (Linha Conectora Orgânica)
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.4);
        doc.line(startX + 6, cursorY - 12, startX + 6, cursorY - 3); // Vertical
        doc.line(startX + 6, cursorY - 3, startX + indentLevel, cursorY - 3); // Horizontal
        
        // Desenha o Card do Conteúdo
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(220, 220, 220);
        
        const splitTexto = doc.splitTextToSize(textoFinal, cardWidth - 10);
        const cardHeight = (splitTexto.length * 5) + 6;
        
        // Sombra leve para o card
        doc.setFillColor(240, 240, 240);
        doc.roundedRect(startX + indentLevel + 0.5, cursorY - 8.5, cardWidth, cardHeight, 1.5, 1.5, 'F');
        
        // Card Principal
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(startX + indentLevel, cursorY - 9, cardWidth, cardHeight, 1.5, 1.5, 'FD');
        
        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(splitTexto, startX + indentLevel + 5, cursorY - 3);
        
        cursorY += cardHeight + 4;
      }

      // Quebra de página automática
      if (cursorY > 275) {
        doc.addPage();
        doc.setFillColor(248, 249, 250);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        doc.setFillColor(227, 6, 19);
        doc.rect(0, 0, 4, pageHeight, 'F');
        cursorY = 25;
      }
    });

    // Rodapé de Segurança
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text("Documento gerado por Aura AI - Unidade de Inteligência Lab-Neuro", 15, pageHeight - 10);

    doc.save(`MAPA_AURA_${userId || 'lab'}_${Date.now()}.pdf`);
  };

  const activeConversation = conversations.find((c) => c.id === activeConvId) || conversations[0];
  const messages = activeConversation.messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
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

    if (!userId) {
      setUserId(userMsg.toLowerCase());
      localStorage.setItem('untbot_last_id', userMsg.toLowerCase());
    }

    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);

    try {
      const idParaBusca = userId || userMsg.toLowerCase();
      const historico = await buscarDoRedis(idParaBusca);
      const contexto = `Você é a Aura AI do Lab Neuro-UNINTA. Mestre: Matheus. Operador: ${idParaBusca}. Histórico: ${historico.join(" | ")}`;
      const resposta = await analisarComGroq(userMsg, contexto);
      
      await salvarNoRedis(idParaBusca, `U: ${userMsg} | B: ${resposta}`);
      addMessage("assistant", resposta);
      falarTexto(resposta);
    } catch (error) {
      addMessage("assistant", "⚠️ Erro na rede neural.");
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

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans relative selection:bg-primary/30">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-[120px]" />
      </div>

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

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[40] lg:hidden"
          />
        )}
      </AnimatePresence>

      <div className={`flex-1 flex flex-col min-w-0 relative z-10 transition-all duration-500 ${sidebarOpen ? "blur-md scale-[0.98] pointer-events-none lg:blur-none lg:scale-100 lg:pointer-events-auto" : ""}`}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-background/40 backdrop-blur-xl">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground"><Menu size={20} /></button>
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]"></span>
            </div>
            <h1 className="text-xs font-bold font-mono tracking-[0.2em] text-primary uppercase text-glow">
                UNINTA // AURA V6 // {userId || "IDENTIFIQUE-SE"}
            </h1>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto chat-scrollbar relative scroll-smooth px-4 bg-gradient-to-b from-transparent to-black/20">
          {!messages.length ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8 opacity-80 scale-90 drop-shadow-2xl">
                <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={audioAnalyzer.isProcessing} size="md" />
              </motion.div>
              <h2 className="text-3xl font-semibold tracking-tight text-white/90">Aura Online</h2>
              <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground/40 mt-3 italic">Lab Neuro-UNINTA // Pronta para análise neural</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full py-10 space-y-8">
              <AnimatePresence mode="popLayout">
                {messages.map((msg) => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
                        <Zap size={14} className="text-primary animate-pulse" />
                      </div>
                    )}
                    <div className={`p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed backdrop-blur-md border shadow-2xl ${msg.role === "user" ? "bg-primary/90 text-primary-foreground border-primary/20" : "bg-white/5 border-white/10 text-white/90"}`}>
                      <ReactMarkdown className="prose prose-invert prose-sm max-w-none">{msg.content}</ReactMarkdown>
                      
                      {msg.role === 'assistant' && (
                        <button 
                          onClick={() => exportarParaPDF(msg.content)} 
                          className="mt-4 flex items-center gap-2 text-[10px] bg-white/5 hover:bg-primary/30 p-2.5 rounded-lg border border-white/10 transition-all uppercase font-bold tracking-tighter shadow-inner"
                        >
                          <FileText size={12} className="text-primary" /> Gerar Mapa Infográfico
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {isTyping && <div className="flex gap-4 mb-8"><div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-primary animate-pulse" /></div><TypingIndicator /></div>}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <footer className="p-6 bg-gradient-to-t from-background to-transparent relative">
          <div className="max-w-3xl mx-auto relative">
            <div className="relative z-10 flex items-end gap-2 bg-black/80 border border-white/10 rounded-[1.5rem] p-2.5 transition-all duration-300 backdrop-blur-[40px] shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
              <button onClick={toggleVoice} className={`p-2.5 rounded-xl transition-all ${audioAnalyzer.isActive ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.5)]" : "text-muted-foreground hover:bg-white/5"}`}>
                {audioAnalyzer.isActive ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              
              <textarea 
                ref={textareaRef} 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown} 
                placeholder={userId ? "Injete um comando neural..." : "Digite o seu nome de operador..."} 
                rows={1} 
                autoComplete="off"
                spellCheck="false"
                className="flex-1 bg-transparent border-0 focus:border-0 focus:ring-0 focus:outline-none resize-none text-sm py-2.5 placeholder:text-muted-foreground/30 font-sans chat-scrollbar overflow-y-auto text-white" 
              />
              
              <button onClick={handleSend} disabled={!input.trim() || isTyping} className="p-2.5 bg-primary text-primary-foreground rounded-xl disabled:opacity-20 shadow-lg active:scale-95 transition-all group">
                {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="group-hover:translate-x-0.5 transition-transform" />}
              </button>
            </div>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center">
            <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={audioAnalyzer.isProcessing} />
            <button onClick={toggleVoice} className="mt-12 p-5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white transition-all shadow-[0_0_30px_rgba(var(--destructive),0.2)]"><MicOff size={24} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
