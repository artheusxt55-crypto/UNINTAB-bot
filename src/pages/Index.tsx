Aqui está o código corrigido com **rolamento melhorado**, **mais informações nas diretrizes** e **animação "Como Posso Ajudar?"**:

```tsx
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, Search, BookOpen, Globe, GraduationCap, Citation, Brain, ExternalLink, HelpCircle } from "lucide-react";
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

function WelcomeMessage() {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: 0 
      }}
      transition={{ 
        duration: 0.8, 
        type: "spring", 
        bounce: 0.3 
      }}
      className="h-full flex flex-col items-center justify-center space-y-8 text-center px-4 max-w-2xl mx-auto"
    >
      <motion.div 
        animate={{ 
          scale: [1, 1.1, 1],
          rotate: [0, 5, -5, 0]
        }}
        transition={{ 
          duration: 3, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        className="w-28 h-28 bg-gradient-to-r from-primary/30 via-secondary/30 to-accent/30 rounded-3xl flex items-center justify-center shadow-2xl shadow-primary/20"
      >
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.7, 1, 0.7]
          }}
          transition={{ 
            duration: 2, 
            repeat: Infinity 
          }}
        >
          <Brain size={40} className="text-primary drop-shadow-lg" />
        </motion.div>
      </motion.div>
      
      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent mb-4">
            Aura IA
          </h2>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="space-y-3"
        >
          <motion.div
            animate={{ 
              opacity: [0.7, 1, 0.7],
              scale: [0.98, 1, 0.98]
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity 
            }}
            className="text-xl font-semibold text-white/90 tracking-wide"
          >
            🤔 <span className="text-primary font-mono text-2xl">Como posso ajudar?</span>
          </motion.div>
          
          <div className="grid md:grid-cols-2 gap-4 mt-8">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 }}
              className="p-4 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 hover:bg-white/10 transition-all group"
            >
              <div className="flex items-start gap-3 mb-2">
                <GraduationCap size={20} className="text-primary mt-0.5 flex-shrink-0" />
                <h4 className="font-semibold text-white text-sm">Neurociência</h4>
              </div>
              <p className="text-xs text-slate-400">Plasticidade neural, sinapses, cognição</p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 }}
              className="p-4 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 hover:bg-white/10 transition-all group"
            >
              <div className="flex items-start gap-3 mb-2">
                <Zap size={20} className="text-secondary mt-0.5 flex-shrink-0" />
                <h4 className="font-semibold text-white text-sm">Psicologia</h4>
              </div>
              <p className="text-xs text-slate-400">Terapias, transtornos, comportamento</p>
            </motion.div>
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="text-sm text-slate-400 space-y-2 pt-6 border-t border-white/10"
          >
            <p>💡 <strong>Dica:</strong> Use "pesquise sobre [tópico]" para pesquisa acadêmica automática</p>
            <p>🎤 Pressione o microfone para falar com a Aura</p>
          </motion.div>
        </motion.div>
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

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  // Análise inteligente de intenção de pesquisa (MELHORADA)
  const analyzeResearchIntent = (text: string): { needsResearch: boolean; query: string } => {
    const lowerText = text.toLowerCase().trim();
    
    const explicitTriggers = [
      'pesquise', 'procure', 'busque', 'investigue', 'pesquisa sobre', 'pesquise sobre',
      'fonte', 'referência', 'referências', 'artigo', 'estudo', 'paper', 'arxiv', 'pubmed',
      'wikipedia', 'wiki', 'definição', 'defina', 'o que é', 'explique detalhadamente',
      'evidências', 'estudos mostram', 'pesquisa indica'
    ];
    
    const academicTerms = [
      'psicologia', 'neurociência', 'cognição', 'terapia', 'psicanálise', 'psicoterapia',
      'depressão', 'ansiedade', 'trauma', 'inteligência', 'memória', 'aprendizagem',
      'plasticidade', 'sinapse', 'neurônio', 'dopamina', 'serotonina', 'córtex',
      'amígdala', 'hipocampo', 'terapia cognitivo-comportamental', 'tcc', 'psicofarmacologia'
    ];
    
    const hasExplicit = explicitTriggers.some(trigger => lowerText.includes(trigger));
    const hasAcademicContext = academicTerms.some(term => lowerText.includes(term));
    
    const needsResearch = hasExplicit || hasAcademicContext;
    let query = text.trim();
    
    if (hasExplicit) {
      // Extrai termos mais específicos da pesquisa
      const match = lowerText.match(/(pesquise|procure|busque|investigue|pesquisa sobre)\s+(.+)/i);
      if (match?.[2]) {
        query = match[2].trim();
      }
    } else if (hasAcademicContext) {
      // Usa o contexto acadêmico como query
      const terms = academicTerms.filter(term => lowerText.includes(term));
      query = `${terms[0]} ${lowerText.split(' ').slice(0, 5).join(' ')}`;
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

  // SCROLL MELHORADO - Auto-scroll suave e inteligente
  useEffect(() => {
    if (messagesEndRef.current && messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      const endElement = messagesEndRef.current;
      
      // Verifica se o usuário está próximo do final (90% scrolled)
      const isNearBottom = container.scrollTop + container.clientHeight >= 
        container.scrollHeight - container.clientHeight * 0.1;
      
      // Só faz scroll se estiver próximo do final ou se for a primeira mensagem
      if (isNearBottom || activeConversation.messages.length <= 1) {
        endElement.scrollIntoView({ 
          behavior: "smooth", 
          block: "end",
          inline: "nearest"
        });
      }
    }
  }, [conversations, isTyping, activeConvId]);

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
        `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&origin=*`
      );
      const data = await response.json();
      
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
  };

  const searchSources = async (query: string): Promise<any[]> => {
    try {
      const wikiResults = await fetchWikipedia(query);
      return wikiResults.slice(0, 5);
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
      id: `${Date.now()}_${Math.random()..toString(36).substr(2, 9)}`,
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

  // Handler principal (CORRIGIDO)
  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = input.trim();
    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);

    try {
      const idParaBusca = userId || userMsg.slice(0, 20).toLowerCase();
      const historico = await buscarDoRedis(idParaBusca);
      
      let contexto = `AURA IA - INTELIGÊNCIA
      ACADÊMICA | ID: ${idParaBusca}

🧠 MODO ACADÊMICO ATIVO:
- Responda como PhD em Psicologia/Neurociência (Lab Assistant: Untbot)
- Estruture: Conceito → Evidências → Aplicação
- Cite fontes NUMERADAS [1], [2] quando fornecidas

📚 HISTÓRICO RECENTE:
${historico.slice(-4).join("\n")}

❓ PERGUNTA ATUAL: ${userMsg}`;

      let sources: Message['sources'] = [];

      // Pesquisa automática
      if (isResearching && researchQuery) {
        sources = await searchSources(researchQuery);
        const fontesTexto = sources.map((s, i) => 
          `${s.citation} "${s.title}" - RESUMO: ${s.snippet}`
        ).join('\n');
        contexto += `\n\n📚 REFERÊNCIAS ENCONTRADAS PARA EMBASAMENTO:\n${fontesTexto}`;
      }

      const resposta = await analisarComGroq(userMsg, contexto);
      
      addMessage("assistant", resposta, sources.length ? sources : undefined, researchQuery);
      
      await salvarNoRedis(idParaBusca, `U: ${userMsg} | A: ${resposta}`);
      falarTexto(resposta);
    } catch (error) {
      console.error('Erro:', error);
      addMessage("assistant", "⚠️ Erro temporário na rede neural. Tente novamente!");
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
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden relative">
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

      <div className="flex-1 flex flex-col min-w-0 relative bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]">
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-xl z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-white/5">
              <Menu size={20} />
            </button>
            <div className="flex flex-col">
              <h1 className="text-[10px] font-mono font-bold tracking-[0.2em] text-primary uppercase">AURA // LAB ASSISTANT</h1>
              <p className="text-[9px] text-slate-500 font-mono uppercase tracking-tighter">Status: Online & Researching</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => exportarParaPDF(messages)} className="p-2 hover:bg-white/5 rounded-lg" title="PDF">
              <FileText size={18} />
            </button>
            <button onClick={toggleVoice} className={`p-2 rounded-full transition-all ${audioAnalyzer.isActive ? "bg-red-500/20 text-red-500 animate-pulse" : "hover:bg-white/5"}`}>
              {audioAnalyzer.isActive ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          </div>
        </header>

        <main ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-8 scrollbar-thin scrollbar-thumb-white/10">
          {messages.length === 0 ? (
            <WelcomeMessage />
          ) : (
            <div className="max-w-4xl mx-auto space-y-8">
              {isResearching && <ResearchStatus isResearching={true} query={researchQuery} />}
              
              <AnimatePresence mode="popLayout">
                {messages.map((msg) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`group relative max-w-[85%] p-6 rounded-3xl shadow-2xl transition-all ${
                      msg.role === "user" 
                        ? "bg-gradient-to-br from-primary to-secondary text-white rounded-tr-none" 
                        : "bg-white/5 border border-white/10 backdrop-blur-xl rounded-tl-none"
                    }`}>
                      <ReactMarkdown className="prose prose-invert prose-sm max-w-none leading-relaxed">
                        {msg.content}
                      </ReactMarkdown>

                      {msg.sources && msg.role === "assistant" && (
                        <div className="mt-6 pt-4 border-t border-white/10 space-y-3">
                          <div className="flex items-center gap-2 text-[10px] font-bold text-primary tracking-widest uppercase">
                            <BookOpen size={12} /> Referências Acadêmicas
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {msg.sources.map((source, i) => (
                              <a key={i} href={source.url} target="_blank" rel="noreferrer" className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-primary/30 hover:bg-white/10 transition-all flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-white truncate">{source.title}</span>
                                <span className="text-[9px] text-slate-500 line-clamp-1">{source.url}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {isTyping && <div className="flex justify-start"><TypingIndicator /></div>}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </main>

        <footer className="p-6 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex items-end gap-2 bg-white/5 border border-white/10 rounded-3xl p-2 backdrop-blur-2xl focus-within:ring-1 ring-primary/50 transition-all shadow-2xl">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre neurovisão, TDAH ou TEA..."
                className="flex-1 bg-transparent border-0 focus:ring-0 text-sm p-4 resize-none outline-none max-h-[120px] text-slate-200"
                rows={1}
              />
              <button 
                onClick={handleSend}
                disabled={isTyping || !input.trim()}
                className={`p-4 rounded-2xl transition-all ${input.trim() ? "bg-primary text-white shadow-lg" : "bg-white/5 text-slate-600"}`}
              >
                {isTyping ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
              </button>
            </div>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-3xl flex flex-col items-center justify-center">
            <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={isTyping} />
            <button onClick={() => setShowVoiceOrb(false)} className="mt-8 p-4 rounded-full bg-red-500/20 text-red-500"><MicOff size={24} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
