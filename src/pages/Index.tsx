import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, Search, BookOpen, Globe } from "lucide-react";
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
  sources?: Array<{
    type: 'wikipedia' | 'scientific';
    title: string;
    url: string;
    snippet: string;
  }>;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

interface WikipediaResponse {
  query: {
    search: Array<{
      title: string;
      snippet: string;
      pageid: number;
    }>;
  };
}

interface ArxivResponse {
  feed: {
    entry: Array<{
      title: string;
      link: Array<{ href: string; title?: string }>;
      summary: string;
    }>;
  };
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
  const [searchCache, setSearchCache] = useState<Map<string, any>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  // Limpeza de cache a cada 10min
  useEffect(() => {
    const interval = setInterval(() => {
      setSearchCache(new Map());
    }, 600000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const savedId = localStorage.getItem('untbot_last_id');
    if (savedId) setUserId(savedId);
  }, []);

  // Debounce para userId
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (input.trim() && !userId && input.toLowerCase().match(/^[a-zA-Z0-9_]+$/)) {
        setUserId(input.toLowerCase());
        localStorage.setItem('untbot_last_id', input.toLowerCase());
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [input, userId]);

  const fetchWikipedia = async (query: string): Promise<any[]> => {
    try {
      const cached = searchCache.get(`wiki_${query}`);
      if (cached) return cached;
      
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&origin=*`
      );
      const data: WikipediaResponse = await response.json();
      const results = data.query.search.slice(0, 3).map((item: any) => ({
        type: 'wikipedia' as const,
        title: item.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
        snippet: item.snippet.replace(/<[^>]*>/g, '').substring(0, 150) + '...'
      }));
      
      setSearchCache(prev => new Map(prev).set(`wiki_${query}`, results));
      return results;
    } catch (error) {
      console.error('Wikipedia API error:', error);
      return [];
    }
  };

  const fetchArxiv = async (query: string): Promise<any[]> => {
    try {
      const cached = searchCache.get(`arxiv_${query}`);
      if (cached) return cached;
      
      const response = await fetch(
        `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=3&sortBy=submittedDate&sortOrder=descending`
      );
      const data: ArxivResponse = await response.json();
      
      const results = data.feed.entry.slice(0, 3).map((entry: any) => {
        const pdfLink = entry.link.find((link: any) => link.title === 'pdf');
        return {
          type: 'scientific' as const,
          title: entry.title,
          url: pdfLink?.href || entry.link[0].href,
          snippet: entry.summary.replace(/<[^>]*>/g, '').substring(0, 150) + '...'
        };
      });
      
      setSearchCache(prev => new Map(prev).set(`arxiv_${query}`, results));
      return results;
    } catch (error) {
      console.error('ArXiv API error:', error);
      return [];
    }
  };

  const searchSources = async (query: string): Promise<any[]> => {
    const [wikiResults, arxivResults] = await Promise.all([
      fetchWikipedia(query),
      fetchArxiv(query)
    ]);
    return [...wikiResults, ...arxivResults];
  };

  const exportarParaPDF = (texto: string, sources?: Message['sources']) => {
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
    
    let yPosition = 40;
    const cleanText = texto.replace(/[*#]/g, '');
    const splitText = doc.splitTextToSize(cleanText, 180);
    doc.text(splitText, 15, yPosition);
    yPosition += (splitText.length * 5) + 15;

    if (sources && sources.length > 0) {
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("🔍 FONTES ACADÊMICAS CONSULTADAS:", 15, yPosition);
      yPosition += 10;
      
      sources.forEach((source) => {
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
        const icon = source.type === 'wikipedia' ? '📖' : '🔬';
        const titleLine = `${icon} ${source.title.substring(0, 60)}${source.title.length > 60 ? '...' : ''}`;
        doc.text(titleLine, 15, yPosition);
        doc.setFontSize(8);
        const urlLine = source.url.replace('http://', '').replace('https://', '').substring(0, 80);
        doc.text(urlLine, 15, yPosition + 4);
        doc.setFontSize(10);
        yPosition += 14;
      });
    }
    
    doc.save(`sinapse_neural_${userId || 'lab'}_${Date.now()}.pdf`);
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

  const addMessage = (role: "user" | "assistant", content: string, sources?: Message['sources']) => {
    const msg: Message = { 
      id: Date.now().toString() + Math.random(), 
      role, 
      content, 
      timestamp: new Date(),
      sources 
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

    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);

    try {
      // Indicador de pesquisa
      addMessage("assistant", "🔍 Pesquisando Wikipedia + ArXiv...", []);

      const sources = await searchSources(userMsg);
      
      const idParaBusca = userId || userMsg.toLowerCase();
      const historico = await buscarDoRedis(idParaBusca);
      
      const fonteTexto = sources.length > 0 
        ? `\n\n**🔍 Fontes encontradas (${sources.length}):**\n${sources.map(s => `• ${s.title.substring(0, 50)}... (${s.type})`).join('\n')}`
        : '\n\n*Nenhuma fonte acadêmica encontrada para esta query*';
      
      const contexto = `Aura AI - Lab Neuro-UNINTA | Mestre: Matheus | Operador: ${idParaBusca}
      
Histórico: ${historico.slice(-3).join(" | ")}
      
${fonteTexto}

INSTRUÇÕES: Use as fontes acima para responder com precisão acadêmica. Cite as fontes naturalmente na resposta.`;

      const resposta = await analisarComGroq(userMsg, contexto);
      
      // Remove mensagem de loading e adiciona resposta final
      setConversations(prev => 
        prev.map(c => 
          c.id === activeConvId 
            ? { 
                ...c, 
                messages: c.messages.slice(0, -1).concat({
                  id: Date.now().toString(),
                  role: 'assistant' as const,
                  content: resposta,
                  timestamp: new Date(),
                  sources
                })
              }
            : c
        )
      );
      
      await salvarNoRedis(idParaBusca, `U: ${userMsg} | B: ${resposta} | S: ${JSON.stringify(sources)}`);
      falarTexto(resposta);
    } catch (error) {
      console.error('Erro na comunicação:', error);
      addMessage("assistant", "⚠️ Erro de conexão neural. Verifique sua internet.\n\n💡 **Dica:** Perguntas específicas funcionam melhor com Wikipedia + ArXiv!");
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
              UNINTA // {userId ? `${userId.toUpperCase()} 🔬` : "AGUARDANDO_ID"}
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
              <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground/40 mt-3 italic">
                Lab Neuro-UNINTA // Wikipedia + ArXiv Integrado // Assistant Online
              </p>
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
                      
                      {/* MOSTRAR FONTES ENCONTRADAS */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-primary/80 mb-3 flex items-center gap-1">
                            <Search size={12} /> Fontes Acadêmicas ({msg.sources.length})
                          </h4>
                          <div className="space-y-2 max-h-32 overflow-y-auto chat-scrollbar">
                            {msg.sources.map((source, i) => (
                              <a 
                                key={i}
                                href={source.url}
                                target="_blank"
                               rel="noopener noreferrer"
                                className="flex items-start gap-2 p-2.5 rounded-lg bg-white/5 hover:bg-primary/10 border border-white/5 text-xs group transition-all duration-200 hover:shadow-lg hover:scale-[1.02]"
                              >
                                <div className="w-6 h-6 mt-0.5 flex-shrink-0 rounded-sm flex items-center justify-center text-xs font-bold bg-primary/20 border border-primary/30">
                                  {source.type === 'wikipedia' ? <Globe size={11} className="text-blue-400" /> : <BookOpen size={11} className="text-green-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-white truncate group-hover:underline">{source.title}</p>
                                  <p className="text-white/70 text-[10px] leading-tight truncate mt-0.5">{source.snippet}</p>
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {msg.role === 'assistant' && (
                        <button 
                          onClick={() => exportarParaPDF(msg.content, msg.sources)} 
                          className="mt-4 flex items-center gap-2 text-[10px] bg-white/5 hover:bg-primary/20 p-2.5 rounded-lg border border-white/10 transition-all duration-200 uppercase font-bold tracking-wider hover:scale-105 shadow-lg hover:shadow-primary/20"
                        >
                          <FileText size={12} /> Gerar Relatório PDF
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
          <div className="max-w-3xl mx-auto relative h-auto">
            <div className="relative z-10 flex items-end gap-2 bg-black/80 border border-white/10 rounded-[1.5rem] p-2.5 transition-all duration-300 backdrop-blur-[40px] shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
              <button onClick={toggleVoice} className={`p-2.5 rounded-xl transition-all ${audioAnalyzer.isActive ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.5)]" : "text-muted-foreground hover:bg-white/5"}`}>
                {audioAnalyzer.isActive ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              
              <textarea 
                ref={textareaRef} 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown} 
                placeholder={userId ? "Injete um comando..." : "Digite seu nome para iniciar..."} 
                rows={1} 
                className="flex-1 bg-transparent border-0 focus:border-0 focus:ring-0 focus:outline-none resize-none text-sm py-2.5 placeholder:text-muted-foreground/30 font-sans chat-scrollbar overflow-y-auto text-white" 
              />
              
              <button onClick={handleSend} disabled={!input.trim() || isTyping} className="p-2.5 bg-primary text-primary-foreground rounded-xl disabled:opacity-20 shadow-lg active:scale-95 transition-all group">
                {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <p className="text-center text-[8px] text-muted-foreground/20 mt-4 font-mono uppercase tracking-[0.5em] animate-pulse">Neural Lab // Protocol 6.0</p>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center">
            <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={audioAnalyzer.isProcessing} />
            <button onClick={toggleVoice} className="mt-12 p-5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"><MicOff size={24} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
