import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, Search, BookOpen, Globe, GraduationCap, Citation, Brain, ExternalLink } from "lucide-react";
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
    type: 'wikipedia' | 'scientific' | 'academic';
    title: string;
    url: string;
    snippet: string;
    citation?: string;
  }>;
  researchQuery?: string;
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
          className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-secondary"
          animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

function ResearchStatus({ isResearching, query }: { isResearching: boolean; query?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-xl border border-primary/30 backdrop-blur-sm mb-4"
    >
      <div className="w-3 h-3 bg-primary rounded-full animate-ping" />
      <div className="flex items-center gap-1">
        <Search size={12} className="text-primary" />
        <span className="text-xs font-mono text-primary/90 tracking-wide">
          {isResearching ? `🔍 Pesquisando "${query?.slice(0, 30)}${query?.length! > 30 ? '...' : ''}"` : '✅ Pesquisa concluída'}
        </span>
      </div>
    </motion.div>
  );
}

export default function Index() {
  const [conversations, setConversations] = useState<Conversation[]>([
    { id: "1", title: "Nova conversa", messages: [], createdAt: new Date() },
  ]);
  const [activeConvId, setActiveConvId] = useState("1");
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [researchQuery, setResearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showVoiceOrb, setShowVoiceOrb] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [searchCache, setSearchCache] = useState<Map<string, any>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  // Análise inteligente de intenção de pesquisa
  const analyzeResearchIntent = (text: string): { needsResearch: boolean; query: string } => {
    const lowerText = text.toLowerCase().trim();
    
    const explicitTriggers = [
      'pesquise', 'procure', 'busque', 'investigue', 'pesquisa sobre',
      'fonte', 'referência', 'artigo', 'estudo', 'paper', 'arxiv',
      'wikipedia', 'wiki', 'definição', 'o que é', 'explique detalhadamente'
    ];
    
    const academicTerms = [
      'psicologia', 'neurociência', 'cognição', 'terapia', 'psicanálise',
      'depressão', 'ansiedade', 'trauma', 'inteligência', 'memória'
    ];
    
    const hasExplicit = explicitTriggers.some(trigger => lowerText.includes(trigger));
    const hasAcademicContext = academicTerms.some(term => lowerText.includes(term));
    
    const needsResearch = hasExplicit || hasAcademicContext;
    let query = text.trim();
    
    if (hasExplicit) {
      const match = lowerText.match(/(pesquise|procure|busque|investigue|pesquisa sobre)\s+(.+)/i);
      if (match?.[2]) query = match[2].trim();
    }
    
    return { needsResearch, query };
  };

  // Effects
  useEffect(() => {
    const { needsResearch, query } = analyzeResearchIntent(input);
    setResearchQuery(query);
    setIsResearching(needsResearch);
  }, [input]);

  useEffect(() => {
    const savedId = localStorage.getItem('aura_ai_last_id');
    if (savedId) setUserId(savedId);
  }, []);

  useEffect(() => {
    if (!userId && input.trim()) {
      const timeoutId = setTimeout(() => {
        const candidateId = input.toLowerCase().match(/^[a-zA-Z0-9_]+$/);
        if (candidateId) {
          setUserId(candidateId[0]);
          localStorage.setItem('aura_ai_last_id', candidateId[0]);
        }
      }, 1500);
      return () => clearTimeout(timeoutId);
    }
  }, [input, userId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // APIs de pesquisa
  const fetchWikipedia = async (query: string): Promise<any[]> => {
    try {
      const cacheKey = `wiki_${query}`;
      if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;
      
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&origin=*`
      );
      const data = await response.json();
      
      const results = data.query.search.slice(0, 3).map((item: any, idx: number) => ({
        type: 'wikipedia' as const,
        title: item.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
        snippet: item.snippet.replace(/<[^>]*>/g, '').substring(0, 120) + '...',
        citation: `[${idx + 1}]`
      }));
      
      setSearchCache(prev => new Map(prev).set(cacheKey, results));
      return results;
    } catch (error) {
      console.error('Wikipedia error:', error);
      return [];
    }
  };

  const searchSources = async (query: string): Promise<any[]> => {
    try {
      const wikiResults = await fetchWikipedia(query);
      return wikiResults.slice(0, 3);
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  };

  // Export PDF
  const exportarParaPDF = (messages: Message[]) => {
    if (!messages.length) return;
    
    const ultimaMsg = messages[messages.length - 1];
    const texto = ultimaMsg.content;
    const sources = ultimaMsg.sources;
    
    const doc = new jsPDF();
    doc.setFillColor(63, 97, 252);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text("🧠 AURA IA - RELATÓRIO ACADÊMICO", 20, 20);
    doc.setFontSize(10);
    doc.text(`ID: ${userId.toUpperCase()} | ${new Date().toLocaleDateString('pt-BR')}`, 140, 20);
    
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(12);
    let yPosition = 45;
    
    const cleanText = texto.replace(/[*#]/g, '');
    const splitText = doc.splitTextToSize(cleanText, 180);
    doc.text(splitText, 15, yPosition);
    yPosition += (splitText.length * 5.5) + 25;

    if (sources?.length) {
      doc.setFontSize(14);
      doc.setTextColor(60, 60, 60);
      doc.text("📚 REFERÊNCIAS ACADÊMICAS", 15, yPosition);
      yPosition += 15;
      
      sources.forEach((source, idx) => {
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 25;
        }
        const icon = source.type === 'wikipedia' ? '📖' : '🔬';
        doc.setFontSize(11);
        doc.text(`${idx + 1}. ${icon} ${source.title.substring(0, 60)}${source.title.length > 60 ? '...' : ''}`, 15, yPosition);
        doc.setFontSize(9);
        doc.text(source.url.replace(/^https?:\/\//, '').substring(0, 90), 18, yPosition + 5);
        yPosition += 18;
      });
    }
    
    doc.save(`aura_ia_${userId || 'academico'}_${Date.now()}.pdf`);
  };

  const activeConversation = conversations.find(c => c.id === activeConvId) || conversations[0];
  const messages = activeConversation.messages;

  // Adicionar mensagem
  const addMessage = (role: "user" | "assistant", content: string, sources?: Message['sources'], researchQuery?: string) => {
    const msg: Message = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date(),
      sources,
      researchQuery
    };
    
    setConversations(prev => prev.map(c => {
      if (c.id !== activeConvId) return c;
      const updated = { ...c, messages: [...c.messages, msg] };
      if (role === "user" && c.messages.length === 0) {
        updated.title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
      }
      return updated;
    }));
  };

  // Handler principal
  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = input.trim();
    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);

    try {
      const idParaBusca = userId || userMsg.slice(0, 20).toLowerCase();
      const historico = await buscarDoRedis(idParaBusca);
      
      let contexto = `AURA IA - INTELIGÊNCIA ACADÊMICA | ID: ${idParaBusca}

🧠 MODO ACADÊMICO ATIVO:
- Responda como PhD em Psicologia/Neurociência
- Estruture: Conceito → Evidências → Aplicação
- Cite fontes NUMERADAS quando fornecidas

📚 HISTÓRICO RECENTE:
${historico.slice(-4).join("\n")}

❓ PERGUNTA ATUAL: ${userMsg}`;

      let sources: Message['sources'] = [];

      // Pesquisa automática
      if (isResearching && researchQuery) {
        sources = await searchSources(researchQuery);
        const fontesTexto = sources.map((s, i) => 
          `${s.citation} "${s.title.substring(0, 70)}..." (${s.type})`
        ).join('\n');
        contexto += `\n\n📚 REFERÊNCIAS ENCONTRADAS (${sources.length}):\n${fontesTexto}`;
      }

      const resposta = await analisarComGroq(userMsg, contexto);
      
      addMessage("assistant", resposta, sources.length ? sources : undefined, researchQuery);
      
      await salvarNoRedis(idParaBusca, `U: ${userMsg} | A: ${resposta} | S: ${JSON.stringify(sources)}`);
      falarTexto(resposta);
    } catch (error) {
      console.error('Erro:', error);
      addMessage("assistant", "⚠️ Erro temporário na rede neural. Tente novamente!\n💡 Dica: Perguntas específicas funcionam melhor.");
    } finally {
      setIsTyping(false);
      setIsResearching(false);
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
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-black overflow-hidden font-['Inter'] relative selection:bg-gradient-to-r from-primary/80 to-secondary/80">
      {/* Background Animado */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[50%] h-[50%] bg-gradient-to-l from-accent/10 to-primary/10 rounded-full blur-[120px] animate-pulse delay-1000" />
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

      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors">
              <Menu size={20} />
            </button>
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <GraduationCap size={18} className="text-primary" />
            </div>
            <h1 className="text-[10px] font-mono font-bold tracking-[0.2em] text-primary uppercase">AURA // LAB ASSISTANT</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => exportarParaPDF(messages)}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              title="Exportar PDF"
            >
              <FileText size={18} />
            </button>
            <button 
              onClick={toggleVoice} 
              className={`p-2 rounded-full transition-all ${
                audioAnalyzer.isActive 
                  ? "bg-red-500/20 text-red-500 animate-pulse border border-red-500/30" 
                  : "hover:bg-white/5"
              }`}
            >
              {audioAnalyzer.isActive ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-8">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center space-y-6 text-center">
              <div className="w-24 h-24 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-2xl flex items-center justify-center">
                <Brain size={32} className="text-primary/50" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">🧠 Aura IA</h2>
                <p className="text-slate-400 max-w-md">Assistente acadêmico especializado em Psicologia e Neurociência. Pergunte qualquer coisa!</p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {isResearching && <ResearchStatus isResearching={true} query={researchQuery} />}
              
              <AnimatePresence>
                {messages.map((msg, index) => (
                  <motion.div 
                    key={msg.id} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[85%] p-6 rounded-3xl shadow-2xl ${
                      msg.role === "user" 
                        ? "bg-gradient-to-r from-primary to-secondary text-white" 
                        : "bg-white/5 border border-white/10 backdrop-blur-xl"
                    } ${msg.sources?.length
                        } ${msg.sources?.length ? 'mb-4' : ''}`}>
                      <ReactMarkdown className="prose prose-invert prose-sm max-w-none">
                        {msg.content}
                      </ReactMarkdown>
                      
                      {msg.sources && msg.sources.length > 0 && msg.role === "assistant" && (
                        <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                          <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                            <BookOpen size={12} /> Referências Encontradas
                          </p>
                          <div className="grid grid-cols-1 gap-2">
                            {msg.sources.map((source, idx) => (
                              <a 
                                key={idx}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
                              >
                                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                                  {source.type === 'wikipedia' ? <Globe size={14} /> : <FileText size={14} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-white truncate">{source.title}</p>
                                    <ExternalLink size={10} className="text-slate-500" />
                                  </div>
                                  <p className="text-[10px] text-slate-400 line-clamp-1">{source.snippet}</p>
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isTyping && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-xl">
                    <TypingIndicator />
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <footer className="p-6 relative">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex items-end gap-2 bg-white/5 border border-white/10 rounded-3xl p-2 backdrop-blur-2xl focus-within:border-primary/50 transition-all shadow-2xl">
              <button className="p-3 text-slate-400 hover:text-primary transition-colors">
                <Plus size={20} />
              </button>
              
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre neurociência ou peça uma pesquisa..."
                className="flex-1 bg-transparent border-0 focus:ring-0 text-sm p-3 resize-none outline-none max-h-[200px] text-slate-200"
                rows={1}
              />

              <button 
                onClick={handleSend}
                disabled={isTyping || !input.trim()}
                className={`p-3 rounded-2xl transition-all ${
                  input.trim() && !isTyping 
                    ? "bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105" 
                    : "bg-white/5 text-slate-500 cursor-not-allowed"
                }`}
              >
                {isTyping ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-500 mt-3 font-medium">
              AURA IA v3.0 | Pesquisa Acadêmica Integrada | Lab Assistant: {userId || 'Untbot'}
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
            className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-3xl flex flex-col items-center justify-center"
          >
            <NeuralOrb 
              isActive={audioAnalyzer.isActive} 
              volume={audioAnalyzer.volume}
              frequency={audioAnalyzer.frequency}
              isProcessing={isTyping}
            />
            <div className="mt-12 flex flex-col items-center gap-4">
              <p className="text-primary font-mono text-sm tracking-widest animate-pulse">
                {isTyping ? "PROCESSANDO SINAPSES..." : "AURA ESTÁ OUVINDO..."}
              </p>
              <button 
                onClick={toggleVoice}
                className="p-4 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all shadow-xl shadow-red-500/10"
              >
                <MicOff size={24} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
