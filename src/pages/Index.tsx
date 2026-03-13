Aqui está o **código COMPLETO e CORRIGIDO**:

```tsx
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Menu, Loader2, FileText, Search, BookOpen, Brain, ExternalLink } from "lucide-react";
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

const TypingIndicator = React.memo(() => {
  return (
    <div className="flex gap-1 items-center px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-gradient-to-r from-red-500/60 to-red-400/60"
          animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
});

const ResearchStatus = React.memo(({ isResearching, query }: { isResearching: boolean; query?: string }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500/20 to-red-400/20 rounded-xl border border-red-500/40 backdrop-blur-sm mb-4 shadow-lg shadow-red-500/10"
    >
      <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
      <div className="flex items-center gap-1">
        <Search size={12} className="text-red-400" />
        <span className="text-xs font-mono text-red-300 tracking-wide max-w-[300px] truncate">
          {isResearching ? `🔍 Pesquisando "${query?.slice(0, 30)}${query?.length! > 30 ? '...' : ''}"` : '✅ Pesquisa concluída'}
        </span>
      </div>
    </motion.div>
  );
});

const WelcomeMessage = React.memo(() => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.8, type: "spring", bounce: 0.3 }}
      className="h-full flex flex-col items-center justify-center space-y-8 text-center px-4 max-w-2xl mx-auto"
    >
      {/* Conteúdo do WelcomeMessage permanece igual */}
      <motion.div 
        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="w-28 h-28 bg-gradient-to-r from-red-500/30 via-red-400/30 to-red-600/30 rounded-3xl flex items-center justify-center shadow-2xl shadow-red-500/20 border border-red-500/30"
      >
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Brain size={40} className="text-red-400 drop-shadow-lg" />
        </motion.div>
      </motion.div>
      
      <div className="space-y-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
          <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-red-500 via-red-400 to-red-600 bg-clip-text text-transparent mb-4">
            AURA IA
          </h2>
        </motion.div>
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }} className="space-y-3">
          <motion.div animate={{ opacity: [0.7, 1, 0.7], scale: [0.98, 1, 0.98] }} transition={{ duration: 2, repeat: Infinity }} className="text-xl font-semibold text-red-300 tracking-wide">
            🤔 <span className="text-red-400 font-mono text-2xl">Oi! Como posso ajudar?</span>
          </motion.div>
          
          <div className="grid md:grid-cols-2 gap-4 mt-8">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 }} className="p-4 bg-red-500/10 backdrop-blur-xl rounded-2xl border border-red-500/20 hover:bg-red-500/20 transition-all group">
              <div className="flex items-start gap-3 mb-2">
                <BookOpen size={20} className="text-red-400 mt-0.5 flex-shrink-0" />
                <h4 className="font-semibold text-red-200 text-sm">Pesquisa Acadêmica</h4>
              </div>
              <p className="text-xs text-red-300">Diga "pesquise sobre..."</p>
            </motion.div>
            
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 }} className="p-4 bg-red-500/10 backdrop-blur-xl rounded-2xl border border-red-500/20 hover:bg-red-500/20 transition-all group">
              <div className="flex items-start gap-3 mb-2">
                <BookOpen size={20} className="text-red-400 mt-0.5 flex-shrink-0" />
                <h4 className="font-semibold text-red-200 text-sm">Conversa Normal</h4>
              </div>
              <p className="text-xs text-red-300">Bate-papo descontraído</p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
});

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

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  const activeConversation = useMemo(() => 
    conversations.find(c => c.id === activeConvId) || conversations[0], 
    [conversations, activeConvId]
  );
  const messages = activeConversation.messages;

  // Análise inteligente de intenção de pesquisa (com debounce)
  useEffect(() => {
    const timeout = setTimeout(() => {
      const { needsResearch, query } = analyzeResearchIntent(input);
      setResearchQuery(query);
      setIsResearching(needsResearch);
    }, 300);
    return () => clearTimeout(timeout);
  }, [input]);

  // Resto dos useEffects (userId, scroll, textarea) permanecem iguais...
  useEffect(() => {
    const savedId = localStorage.getItem('aura_ai_last_id');
    if (savedId) setUserId(savedId);
  }, []);

  // APIs de pesquisa permanecem iguais...
  const fetchWikipedia = useCallback(async (query: string): Promise<any[]> => {
    try {
      const cacheKey = `wiki_${query.toLowerCase().trim()}`;
      if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;
      
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&origin=*`,
        { cache: 'force-cache' }
      );
      if (!response.ok) throw new Error('Wikipedia API failed');
      
      const data = await response.json();
      if (!data.query?.search) return [];
      
      const results = data.query.search.slice(0, 5).map((item: any, idx: number) => ({
        type: 'wikipedia' as const,
        title: item.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
        snippet: item.snippet.replace(/<[^>]*>/g, '').substring(0, 150) + '...',
        citation: `[${idx + 1}]`
      }));
      
      setSearchCache(prev => new Map(prev).set(cacheKey, results));
      return results;
    } catch (error) {
      console.error('Wikipedia error:', error);
      return [];
    }
  }, [searchCache]);

  const searchSources = useCallback(async (query: string): Promise<any[]> => {
    try {
      const wikiResults = await fetchWikipedia(query);
      return wikiResults.slice(0, 5);
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }, [fetchWikipedia]);

  // PDF REPORT CORRIGIDO
  const exportarParaPDF = useCallback((messages: Message[]) => {
    if (!messages.length) return;
    
    const ultimaMsg = messages[messages.length - 1];
    const texto = ultimaMsg.content;
    const sources = ultimaMsg.sources;
    
    const doc = new jsPDF();
    
    // HEADER VERMELHO
    doc.setFillColor(139, 0, 0);
    doc.rect(0, 0, 210, 40, 'F');
    
    // Título principal
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("🧠 AURA IA - RELATÓRIO ACADÊMICO", 20, 22);
    
    // Subtítulo
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`ID: ${userId.toUpperCase() || 'ANÔNIMO'} | ${new Date().toLocaleDateString('pt-BR')} | ${new Date().toLocaleTimeString('pt-BR')}`, 20, 35);
    
    let yPosition = 55;
    
    // ÍCONE E SETA
    doc.setFillColor(220, 20, 60);
    doc.circle(18, yPosition + 5, 4, 'F');
    doc.setDrawColor(139, 0, 0);
    doc.line(25, yPosition + 7, 35, yPosition + 7);
    
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("→ CONTEÚDO PRINCIPAL", 40, yPosition + 8);
    
    yPosition += 25;
    
    // Conteúdo principal
    const cleanText = texto.replace(/[*#]/g, '');
    const splitText = doc.splitTextToSize(cleanText, 180);
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(splitText, 15, yPosition);
    yPosition += (splitText.length * 6) + 20;

    // REFERÊNCIAS
    if (sources?.length) {
      doc.setFillColor(220, 20, 60);
      doc.circle(18, yPosition + 5, 4, 'F');
      doc.line(25, yPosition + 7, 35, yPosition + 7);
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(139, 0, 0);
      doc.rect(38, yPosition - 2, 170, 18, 'F');
      doc.text("→ REFERÊNCIAS ACADÊMICAS", 42, yPosition + 10);
      
      yPosition += 30;
      
      sources.forEach((source, idx) => {
        if (yPosition > 260) {
          doc.addPage();
          yPosition = 25;
        }
        
        doc.setTextColor(220, 20, 60);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(`${idx + 1}.`, 15, yPosition);
        
        const icon = source.type === 'wikipedia' ? '📖' : '🔬';
        doc.text(icon, 28, yPosition);
        
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        const titleText = source.title.substring(0, 70) + (source.title.length > 70 ? '...' : '');
        doc.text(titleText, 38, yPosition);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        const urlText = source.url.replace(/^https?:\/\//, '').substring(0, 90);
        doc.text(urlText, 38, yPosition + 6);
        
        yPosition += 18;
      });
    }
    
    // Footer CORRIGIDO
    doc.setFillColor(139, 0, 0);
    doc.rect(0, 297 - 20, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text("Gerado por AURA IA - Inteligência Acadêmica", 20, 285);
    doc.text("⚠️ Este documento é para uso educacional e pesquisa", 20, 290);
    
    doc.save(`aura_ia_${userId || 'relatorio'}_${Date.now()}.pdf`);
  }, [userId]);

  const addMessage = useCallback((role: "user" | "assistant", content: string, sources?: Message['sources'], researchQuery?: string) => {
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
  }, [activeConvId]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = input.trim();
    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);

    try {
      const idParaBusca = userId || userMsg.slice(0, 20).toLowerCase().replace(/[^a-z0-9]/g, '');
      const historico = await buscarDoRedis(idParaBusca);
      
      let contexto = `AURA IA - ASSISTENTE INTELIGENTE | ID: ${idParaBusca}

🧠 MODO CONVERSACIONAL:
- Se for pedido "pesquise sobre", "procure" ou "investigue": ative MODO ACADÊMICO
- Caso contrário: converse normalmente
- Cite fontes NUMERADAS [1], [2] SOMENTE quando pesquisa for ativada

📚 HISTÓRICO RECENTE:
${historico.slice(-4).join("\n")}

❓ PERGUNTA ATUAL: ${userMsg}`;

      let sources: Message['sources'] = [];

      if (isResearching && researchQuery) {
        sources = await searchSources(researchQuery);
        const fontesTexto = sources.map((s, i) => 
          `${s.citation} "${s.title}" - RESUMO: ${s.snippet}`
        ).join('\n');
        contexto += `\n\n📚 REFERÊNCIAS ENCONTRADAS:\n${fontesTexto}`;
      }

      const resposta = await analisarComGroq(userMsg, contexto);
      
      addMessage("assistant", resposta, sources.length ? sources : undefined, researchQuery);
      
      await salvarNoRedis(idParaBusca, `U: ${userMsg} | A: ${resposta}`);
      falarTexto(resposta);
         await salvarNoRedis(idParaBusca, `U: ${userMsg} | A: ${resposta}`);
      falarTexto(resposta);
    } catch (error) {
      console.error('Erro na comunicação:', error);
      addMessage("assistant", "⚠️ Ops! Erro temporário. Tente novamente em alguns segundos. Verifique sua conexão.");
    } finally {
      setIsTyping(false);
      setIsResearching(false);
    }
  }, [input, isTyping, userId, isResearching, researchQuery, addMessage, searchSources, activeConvId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const toggleVoice = useCallback(() => {
    if (audioAnalyzer.isActive) {
      audioAnalyzer.stop();
      setShowVoiceOrb(false);
    } else {
      audioAnalyzer.start();
      setShowVoiceOrb(true);
    }
  }, [audioAnalyzer.isActive]);

  // Auto-scroll otimizado
  useEffect(() => {
    if (messagesEndRef.current && messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      const endElement = messagesEndRef.current;
      
      const isNearBottom = container.scrollTop + container.clientHeight >= 
        container.scrollHeight - container.clientHeight * 0.1;
      
      if (isNearBottom || messages.length <= 1) {
        endElement.scrollIntoView({ 
          behavior: "smooth", 
          block: "end",
          inline: "nearest"
        });
      }
    }
  }, [messages.length, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const maxHeight = 120;
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + "px";
    }
  }, [input]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-black to-slate-950 text-slate-200 overflow-hidden relative">
      {/* Sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeConvId={activeConvId}
        onSelect={(id) => { 
          setActiveConvId(id); 
          setSidebarOpen(false); 
        }}
        onNew={() => {
          const id = Date.now().toString();
          setConversations(prev => [{ 
            id, 
            title: "Nova conversa", 
            messages: [], 
            createdAt: new Date() 
          }, ...prev]);
          setActiveConvId(id);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-red-500/20 bg-black/30 backdrop-blur-xl z-10 shadow-lg shadow-red-500/5 sticky top-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)} 
              className="lg:hidden p-2 rounded-lg hover:bg-red-500/10 border border-red-500/20 transition-all"
            >
              <Menu size={20} className="text-red-400" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-[10px] font-mono font-bold tracking-[0.2em] text-red-400 uppercase">AURA // LAB ASSISTANT</h1>
              <p className="text-[9px] text-red-300 font-mono uppercase tracking-tighter">
                {isResearching ? '🔍 MODO PESQUISA' : '💬 MODO CONVERSA'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => exportarParaPDF(messages)} 
              className="p-2 hover:bg-red-500/10 border border-red-500/20 rounded-lg transition-all group" 
              title="Exportar PDF"
              disabled={messages.length === 0}
            >
              <FileText size={18} className="group-hover:text-red-400 text-red-500 transition-colors" />
            </button>
            <button 
              onClick={toggleVoice} 
              className={`p-2 rounded-full transition-all border border-red-500/20 shadow-lg ${
                audioAnalyzer.isActive 
                  ? "bg-red-500/20 text-red-400 animate-pulse shadow-lg shadow-red-500/20" 
                  : "hover:bg-red-500/10 text-red-400 hover:shadow-red-500/20"
              }`}
              aria-label="Toggle voice"
            >
              {audioAnalyzer.isActive ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          </div>
        </header>

        {/* Messages */}
        <main ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-8 scrollbar-thin scrollbar-thumb-red-500/30 scrollbar-track-slate-900/50">
          {messages.length === 0 ? (
            <WelcomeMessage />
          ) : (
            <div className="max-w-4xl mx-auto space-y-8">
              {isResearching && <ResearchStatus isResearching={true} query={researchQuery} />}
              
              <AnimatePresence mode="popLayout">
                {messages.map((msg) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    layout
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`group relative max-w-[85%] p-6 rounded-3xl shadow-2xl transition-all backdrop-blur-xl ${
                      msg.role === "user" 
                        ? "bg-gradient-to-br from-red-500/20 to-red-400/20 text-red-100 border border-red-500/30 rounded-tr-none hover:shadow-red-500/30" 
                        : "bg-slate-800/50 border border-red-500/10 rounded-tl-none hover:border-red-500/20 hover:shadow-lg"
                    }`}>
                      <ReactMarkdown 
                        className="prose prose-invert prose-sm max-w-none leading-relaxed text-slate-200 break-words"
                        components={{
                          a: ({ node, ...props }) => (
                            <a 
                              {...props} 
                              className="text-red-400 hover:text-red-300 underline underline-offset-2 decoration-red-400" 
                              target="_blank" 
                              rel="noreferrer noopener"
                            />
                          ),
                          code: ({ node, ...props }) => (
                            <code className="bg-red-500/10 text-red-300 px-1.5 py-0.5 rounded font-mono text-xs border border-red-500/20" {...props} />
                          )
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>

                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-red-500/20 space-y-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-red-400 tracking-widest uppercase bg-red-500/10 px-3 py-2 rounded-xl">
                            <BookOpen size={14} /> REFERÊNCIAS ACADÊMICAS
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {msg.sources.map((source, i) => (
                              <motion.a 
                                key={i} 
                                href={source.url} 
                                target="_blank" 
                                rel="noreferrer noopener"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="group/source p-4 rounded-2xl bg-gradient-to-r from-red-500/5 to-red-400/5 border border-red-500/20 hover:border-red-400/40 hover:bg-red-500/10 transition-all shadow-lg hover:shadow-red-500/20 hover:-translate-y-1"
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="w-6 h-6 bg-red-500 text-white rounded-lg flex items-center justify-center text-xs font-bold shadow-lg">
                                    {i + 1}
                                  </span>
                                  <span className="text-xs font-mono text-red-400 capitalize">{source.type}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-sm font-semibold text-white truncate block group-hover/source:text-red-300">
                                    {source.title}
                                  </span>
                                  <span className="text-xs text-slate-400 line-clamp-2">
                                    {source.snippet}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 pt-2 border-t border-red-500/10 mt-2">
                                  <ExternalLink size={12} className="text-red-400 flex-shrink-0" />
                                  <span className="text-xs text-red-300 truncate">{source.url.replace(/^https?:\/\//, '')}</span>
                                </div>
                              </motion.a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isTyping && (
                <div className="flex justify-start">
                  <TypingIndicator />
                </div>
              )}
              
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </main>

        {/* Input Footer */}
        <footer className="p-6 bg-gradient-to-t from-black via-slate-900 to-transparent border-t border-red-500/10">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex items-end gap-2 bg-slate-800/50 border border-red-500/20 rounded-3xl p-3 backdrop-blur-3xl focus-within:border-red-400/50 focus-within:shadow-2xl focus-within:shadow-red-500/20 focus-within:ring-2 ring-red-500/30 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isResearching 
                  ? `🔍 Pesquisando "${researchQuery}"... Digite sua pergunta` 
                  : "Digite sua mensagem... (diga 'pesquise sobre X' para modo acadêmico)"
                }
                className="flex-1 bg-transparent border-0 focus:ring-0 text-sm p-4 resize-none outline-none max-h-[120px] text-slate-200 placeholder-red-400 scrollbar-none"
                rows={1}
                disabled={isTyping}
              />
              <button 
                onClick={handleSend}
                disabled={isTyping || !input.trim()}
                className={`p-4 rounded-2xl transition-all shadow-lg flex items-center justify-center ${
                  input.trim() && !isTyping
                    ? "bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-red-500/25 hover:shadow-red-500/40 active:scale-95" 
                    : "bg-red-500/20 text-red-400 border-2 border-red-500/30 cursor-not-allowed"
                }`}
                aria-label="Enviar mensagem"
              >
                {isTyping ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Voice Orb Overlay */}
      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-8"
          >
            <NeuralOrb 
              isActive={audioAnalyzer.isActive} 
              volume={audioAnalyzer.volume} 
              frequency={audioAnalyzer.frequency} 
              isProcessing={isTyping} 
            />
            <motion.button 
              onClick={toggleVoice}
              className="mt-12 p-5 rounded-2xl bg-red-500/20 text-red-400 border-2 border-red-500/30 hover:bg-red-500/30 hover:border-red-500/50 transition-all shadow-2xl shadow-red-500/20 hover:shadow-red-500/40 active:scale-95"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <MicOff size={28} />
            </motion.button>
            <p className="mt-4 text-red-300 text-sm font-mono tracking-wide">Toque para parar</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Função helper (fora do componente)
function analyzeResearchIntent(text: string): { needsResearch: boolean; query: string } {
  const lowerText = text.toLowerCase().trim();
  
  const explicitTriggers = [
    'pesquise', 'pesquisa sobre', 'procure', 'busque', 'investigue', 
    'fonte', 'referência', 'artigo', 'estudo', 'paper', 
    'arxiv', 'pubmed', 'wikipedia', 'wiki'
  ];
  
  const hasExplicit = explicitTriggers.some(trigger => lowerText.includes(trigger));
  const needsResearch = hasExplicit;
  let query = text.trim();
  
  if (hasExplicit) {
    const match = lowerText.match(/(pesquise|pesquisa sobre|procure|busque)\s+(.+)/i);
    if (match?.[2]) {
      query = match[2].trim();
    }
  }
  
  return { needsResearch, query };
}
