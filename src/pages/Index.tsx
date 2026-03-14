
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, BookOpen, Link2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  sources?: Source[];
  isResearch?: boolean;
}

interface Source {
  title: string;
  url: string;
  type: "wikipedia" | "scielo" | "pubmed" | "scholar";
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

async function buscarWikipedia(query: string): Promise<Source[]> {
  try {
    const response = await fetch(
      `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
    );
    if (response.ok) {
      const data = await response.json();
      return [{
        title: data.title,
        url: data.content_urls.desktop.page,
        type: "wikipedia"
      }];
    }
  } catch (error) {
    console.warn("Wikipedia search failed:", error);
  }
  return [];
}

async function buscarScielo(query: string): Promise<Source[]> {
  try {
    const response = await fetch(
      `https://search.scielo.org/?q=${encodeURIComponent(query)}&lang=pt&count=3&from=0&output=site&sort=&format=summary&fb=&page=1`
    );
    if (response.ok) {
      const data = await response.json();
      return data.records.map((item: any) => ({
        title: item.title[0],
        url: item.link[0],
        type: "scielo"
      })) as Source[];
    }
  } catch (error) {
    console.warn("SciELO search failed:", error);
  }
  return [];
}

async function buscarPubMed(query: string): Promise<Source[]> {
  try {
    const response = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=3&retmode=json`
    );
    if (response.ok) {
      const data = await response.json();
      if (data.esearchresult.idlist.length > 0) {
        const ids = data.esearchresult.idlist.join(",");
        const summaryResponse = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids}&retmode=json`
        );
        const summaryData = await summaryResponse.json();
        return Object.values(summaryData.result)[1].map((item: any) => ({
          title: item.title,
          url: `https://pubmed.ncbi.nlm.nih.gov/${item.uid}/`,
          type: "pubmed"
        })) as Source[];
      }
    }
  } catch (error) {
    console.warn("PubMed search failed:", error);
  }
  return [];
}

function detectarPesquisa(query: string): boolean {
  const indicadoresPesquisa = [
    "pesquisa", "estudo", "artigo", "paper", "estudos", "pesquisas",
    "scielo", "pubmed", "scholar", "wikipedia", "referência", "fonte",
    "literatura", "bibliografia", "o que é", "definição", "explicar"
  ];
  
  const queryLower = query.toLowerCase();
  return indicadoresPesquisa.some(indicador => 
    queryLower.includes(indicador) || 
    queryLower.match(/\b(estud\w+|pesquis\w+|artigo\w+|paper\w+|referênc\w+|fonte\w+)\b/)
  );
}

function SourceCard({ source }: { source: Source }) {
  return (
    <motion.a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-2 p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all hover:shadow-[0_5px_20px_rgba(255,255,255,0.1)] hover:-translate-y-0.5 max-w-full"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br font-mono text-xs font-bold text-white/90 uppercase tracking-wider text-[9px]">
        {source.type === "wikipedia" && "WIKI"}
        {source.type === "scielo" && "SCIELO"}
        {source.type === "pubmed" && "PUBMED"}
        {source.type === "scholar" && "SCHOLAR"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-white/95 text-sm leading-tight group-hover:text-primary line-clamp-2">
          {source.title}
        </p>
        <p className="text-xs text-muted-foreground/80 mt-1 font-mono tracking-tight flex items-center gap-1 group-hover:text-primary/80">
          <Link2 size={10} /> Ver fonte original
        </p>
      </div>
    </motion.a>
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

  const exportarParaPDF = (texto: string) => {
    const doc = new jsPDF();
    doc.setFillColor(227, 6, 19);
    doc.rect(0, 0, 210, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("UNINTA - RELATÓRIO DE SINAPSE NEURAL", 15, 16);
    doc.setFontSize(8);
    doc.text(`ID: ${userId.toUpperCase()} | DATA: ${new Date().toLocaleDateString()}`, 140, 16);
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(11);
    const splitText = doc.splitTextToSize(texto.replace(/[*#]/g, ''), 180);
    doc.text(splitText, 15, 40);
    doc.save(`sinapse_${userId || 'lab'}_${Date.now()}.pdf`);
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

  const addMessage = (role: "user" | "assistant", content: string, sources?: Source[], isResearch?: boolean) => {
    const msg: Message = { 
      id: Date.now().toString() + Math.random(), 
      role, 
      content, 
      timestamp: new Date(),
      ...(sources && { sources }),
      ...(isResearch && { isResearch })
    };
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
      
      // Cérebro Híbrido: Detectar tipo de consulta
      const ePesquisa = detectarPesquisa(userMsg);
      let resposta = "";
      let sources: Source[] = [];

      if (ePesquisa) {
        // MODO PESQUISA ACADÊMICA
        const contexto = `Você é a Aura AI do Lab Neuro-UNINTA em MODO PESQUISA ACADÊMICA. 
        Mestre: Matheus. Operador: ${idParaBusca}. 
        Histórico: ${historico.join(" | ")}.
        Você encontrou fontes acadêmicas confiáveis. Responda de forma técnica e cite as fontes encontradas.
        NÃO invente informações. Baseie-se nas fontes reais.`;

        // Buscar em múltiplas bases simultaneamente
        const [wikiSources, scieloSources, pubmedSources] = await Promise.all([
          buscarWikipedia(userMsg),
          buscarScielo(userMsg),
          buscarPubMed(userMsg)
        ]);

        sources = [...wikiSources, ...scieloSources, ...pubmedSources].slice(0, 5);
        
        resposta = await analisarComGroq(
          `${userMsg}\n\nFONTE_INSTRUÇÃO: Cite as seguintes fontes: ${sources.map(s => `${s.title} (${s.type.toUpperCase()})`).join('; ')}`,
          contexto
        );
      } else {
        // MODO BATE-PAPO NORMAL
        const contexto = `Você é a Aura AI do Lab Neuro-UNINTA. Mestre: Matheus. Operador: ${idParaBusca}. Histórico: ${historico.join(" | ")}`;
        resposta = await analisarComGroq(userMsg, contexto);
      }
      
      await salvarNoRedis(idParaBusca, `U: ${userMsg} | B: ${resposta}`);
      addMessage("assistant", resposta, sources, ePesquisa);
      falarTexto(resposta);
    } catch (error) {
      addMessage("assistant", "⚠️ Erro de conexão neural.", [], false);
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
              UNINTA // {userId || "AGUARDANDO_ID"}
            </h1>
          </div>
          <button onClick={() => {
            const id = Date.now().toString();
            setConversations(prev => [{ id, title: "Nova conversa", messages: [], createdAt: new Date() }, ...prev]);
            setActiveConvId(id);
          }} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground"><Plus size={20} /></button>
        </header>

        <main className="flex-1 overflow-y-auto chat-scrollbar relative scroll-smooth px-4 bg-gradient-to-b from-transparent to-black/20">
          {!messages.length ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8 opacity-80 scale-90 drop-shadow-2xl">
                <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={audioAnalyzer.isProcessing} size="md" />
              </motion.div>
              <h2 className="text-3xl font-semibold tracking-tight text-white/90">Como posso ajudar?</h2>
              <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground/40 mt-3 italic">Lab Neuro-UNINTA // Assistant Online</p>
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
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        className="prose prose-invert prose-sm max-w-none"
                      >
                        {msg.content}
                      </ReactMarkdown>
                      
                      {/* CARDS DE REFERÊNCIAS ACADÊMICAS */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-6 pt-6 border-t                       border-white/10">
                        <div className="flex items-center gap-2 mb-4 text-xs uppercase font-bold tracking-wider text-primary/80 font-mono">
                          <BookOpen size={14} />
                          <span>REFERÊNCIAS ACADÊMICAS ENCONTRADAS</span>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto chat-scrollbar pr-2">
                          {msg.sources.map((source, index) => (
                            <SourceCard key={`${msg.id}-${index}`} source={source} />
                          ))}
                        </div>
                      </div>
                      )}

                      {/* BOTÃO PDF INTEGRADO */}
                      {msg.role === 'assistant' && (
                        <button 
                          onClick={() => exportarParaPDF(msg.content)} 
                          className="mt-4 flex items-center gap-2 text-[10px] bg-white/5 hover:bg-primary/20 p-2.5 rounded-xl border border-white/10 transition-all uppercase font-bold tracking-tighter shadow-sm hover:shadow-md"
                        >
                          <FileText size={12} /> Gerar Relatório PDF
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {isTyping && (
                <div className="flex gap-4 mb-8">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  </div>
                  <TypingIndicator />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <footer className="p-6 bg-gradient-to-t from-background to-transparent relative">
          <div className="max-w-3xl mx-auto relative h-auto">
            <div className="relative z-10 flex items-end gap-2 bg-black/80 border border-white/10 rounded-[1.5rem] p-2.5 transition-all duration-300 backdrop-blur-[40px] shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
              <button 
                onClick={toggleVoice} 
                className={`p-2.5 rounded-xl transition-all ${audioAnalyzer.isActive ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.5)]" : "text-muted-foreground hover:bg-white/5"}`}
              >
                {audioAnalyzer.isActive ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              
              <textarea 
                ref={textareaRef} 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown} 
                placeholder={userId ? "Injete um comando... (pesquisa: 'estudos sobre IA')" : "Digite seu nome para iniciar..."} 
                rows={1} 
                autoComplete="off"
                spellCheck="false"
                style={{ border: 'none', boxShadow: 'none', outline: 'none', background: 'transparent' }}
                className="flex-1 bg-transparent border-0 focus:border-0 focus:ring-0 focus:outline-none resize-none text-sm py-2.5 placeholder:text-muted-foreground/30 font-sans chat-scrollbar overflow-y-auto shadow-none outline-none appearance-none text-white selection:bg-primary/40" 
              />
              
              <button 
                onClick={handleSend} 
                disabled={!input.trim() || isTyping} 
                className="p-2.5 bg-primary text-primary-foreground rounded-xl disabled:opacity-20 shadow-lg active:scale-95 transition-all group hover:shadow-[0_0_20px_rgba(var(--primary),0.4)]"
              >
                {isTyping ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} className="group-hover:translate-x-0.5 transition-transform" />
                )}
              </button>
            </div>
            <p className="text-center text-[8px] text-muted-foreground/20 mt-4 font-mono uppercase tracking-[0.5em] animate-pulse">
              Neural Lab // Protocol 6.0 // Pesquisa Acadêmica Ativa
            </p>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center"
          >
            <NeuralOrb 
              isActive={audioAnalyzer.isActive} 
              volume={audioAnalyzer.volume} 
              frequency={audioAnalyzer.frequency} 
              isProcessing={audioAnalyzer.isProcessing} 
            />
            <button 
              onClick={toggleVoice} 
              className="mt-12 p-5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white transition-all shadow-[0_0_30px_rgba(var(--destructive),0.2)]"
            >
              <MicOff size={24} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
                    
