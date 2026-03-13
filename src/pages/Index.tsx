import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, Search, BookOpen, Globe, GraduationCap, Citation, Brain, ExternalLink, Users, Building2 } from "lucide-react";
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
    type: 'wikipedia' | 'scielo' | 'pubmed' | 'arxiv' | 'scholar' | 'uninta';
    title: string;
    url: string;
    snippet: string;
    citation?: string;
    reliability?: 'high' | 'medium' | 'low';
  }>;
  researchQuery?: string;
  contextType?: 'academic' | 'conversational' | 'uninta' | 'reception';
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

function ResearchStatus({ isResearching, query, sourcesCount }: { isResearching: boolean; query?: string; sourcesCount?: number }) {
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
          {isResearching 
            ? `🔍 Pesquisando "${query?.slice(0, 30) || ''}${query && query.length > 30 ? '...' : ''}"` 
            : `✅ ${sourcesCount || 0} fontes encontradas`
          }
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

  const analyzeResearchIntent = (text: string): { 
    needsResearch: boolean; 
    query: string; 
    contextType: Message['contextType'];
    prioritySources: ('wikipedia' | 'scielo' | 'pubmed' | 'arxiv' | 'scholar' | 'uninta')[];
  } => {
    const lowerText = text.toLowerCase().trim();
    
    const unintaTriggers = [
      'uninta', 'tianguá', 'tiangua', 'professor', 'professora', 'docente',
      'aluno', 'alunos', 'estudante', 'estudantes', 'coordenação', 'coordenador'
    ];
    
    const academicTriggers = [
      'pesquise', 'procure', 'busque', 'investigue', 'pesquisa sobre', 'fonte', 'referência',
      'artigo', 'estudo', 'paper', 'arxiv', 'scielo', 'pubmed', 'scholar',
      'wikipedia', 'wiki', 'definição', 'o que é', 'explique detalhadamente',
      'evidência', 'estudos mostram', 'pesquisa indica'
    ];
    
    const psychTerms = [
      'psicologia', 'neurociência', 'cognição', 'terapia', 'psicanálise',
      'depressão', 'ansiedade', 'trauma', 'inteligência', 'memória',
      'dsm-5', 'terapia cognitivo-comportamental', 'tcc', 'psicopatologia'
    ];
    
    const casualTriggers = ['oi', 'olá', 'e aí', 'como vai', 'tudo bem', 'fale sobre'];
    
    const hasUninta = unintaTriggers.some(trigger => lowerText.includes(trigger));
    const hasAcademic = academicTriggers.some(trigger => lowerText.includes(trigger));
    const hasPsychContext = psychTerms.some(term => lowerText.includes(term));
    const isCasual = casualTriggers.some(trigger => lowerText.startsWith(trigger));
    
    let contextType: Message['contextType'] = 'conversational';
    let needsResearch = false;
    let query = text.trim();
    let prioritySources: ('wikipedia' | 'scielo' | 'pubmed' | 'arxiv' | 'scholar' | 'uninta')[] = [];

    if (hasUninta) {
      contextType = 'uninta';
      needsResearch = true;
      prioritySources = ['uninta', 'wikipedia', 'scholar'];
      query = `UNINTA Tianguá ${query}`;
    } else if (hasAcademic || hasPsychContext) {
      contextType = 'academic';
      needsResearch = true;
      prioritySources = ['scielo', 'pubmed', 'arxiv', 'scholar', 'wikipedia'];
    } else if (isCasual) {
      contextType = 'reception';
      needsResearch = false;
    }

    if (hasAcademic) {
      const match = lowerText.match(/(pesquise|procure|busque|investigue|pesquisa sobre)\s+(.+)/i);
      if (match?.[2]) query = match[2].trim();
    }
    
    return { needsResearch, query, contextType, prioritySources };
  };

  const fetchWikipedia = async (query: string): Promise<any[]> => {
    try {
      const cacheKey = `wiki_${query}`;
      if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;
      
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=2&origin=*`
      );
      const data = await response.json();
      
      const results = data.query?.search?.slice(0, 2).map((item: any, idx: number) => ({
        type: 'wikipedia' as const,
        title: item.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
        snippet: item.snippet?.replace(/<[^>]*>/g, '').substring(0, 120) + '...' || 'Artigo da Wikipedia.',
        citation: `[${idx + 1}]`,
        reliability: 'medium' as const
      })) || [];
      
      setSearchCache(prev => new Map(prev).set(cacheKey, results));
      return results;
    } catch (error) {
      console.error('Wikipedia error:', error);
      return [];
    }
  };

  const fetchScielo = async (query: string): Promise<any[]> => {
    try {
      const cacheKey = `scielo_${query}`;
      if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;
      
      // SciELO simulada (API real requer CORS/proxy)
      const results = [{
        type: 'scielo' as const,
        title: `Artigo SciELO: "${query}"`,
        url: `https://search.scielo.org/?q=${encodeURIComponent(query)}`,
        snippet: `Artigo científico brasileiro sobre "${query}". Plataforma SciELO Brasil com milhares de estudos acadêmicos.`,
        citation: '[1]',
        reliability: 'high' as const
      }];
      
      setSearchCache(prev => new Map(prev).set(cacheKey, results));
      return results;
    } catch (error) {
      console.error('SciELO error:', error);
      return [];
    }
  };

  const fetchPubMed = async (query: string): Promise<any[]> => {
    try {
      const results = [{
        type: 'pubmed' as const,
        title: `PubMed: "${query}"`,
        url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`,
        snippet: 'Base MEDLINE com 35M+ citações biomédicas da NIH.',
        citation: '[1]',
        reliability: 'high' as const
      }];
      
      const cacheKey = `pubmed_${query}`;
      setSearchCache(prev => new Map(prev).set(cacheKey, results));
      return results;
    } catch (error) {
      console.error('PubMed error:', error);
      return [];
    }
  };

  const fetchArxiv = async (query: string): Promise<any[]> => {
    try {
      const results = [{
        type: 'arxiv' as const,
        title: `Arxiv: "${query}"`,
        url: `https://arxiv.org/search/?query=${encodeURIComponent(query)}`,
        snippet: 'Preprints científicos de física, matemática, IA e mais.',
        citation: '[1]',
        reliability: 'high' as const
      }];
      
      const cacheKey = `arxiv_${query}`;
      setSearchCache(prev => new Map(prev).set(cacheKey, results));
      return results;
    } catch (error) {
      console.error('Arxiv error:', error);
      return [];
    }
  };

  const fetchUninta = async (query: string): Promise<any[]> => {
    return [{
      type: 'uninta' as const,
      title: "UNINTA Tianguá - Universidade Internacional do Cariri",
      url: "https://uninta.edu.br/campus-tiangua/",
      snippet: "Campus Tianguá da UNINTA. Cursos de Psicologia, Enfermagem e mais.",
      citation: "[1]",
      reliability: 'high' as const
    }];
  };

  const searchSources = async (query: string, prioritySources: string[]): Promise<any[]> => {
    const allPromises = prioritySources.map(source => {
      switch (source) {
        case 'wikipedia': return fetchWikipedia(query);
        case 'scielo': return fetchScielo(query);
        case 'pubmed': return fetchPubMed(query);
        case 'arxiv': return fetchArxiv(query);
        case 'uninta': return fetchUninta(query);
        default: return Promise.resolve([] as any[]);
      }
    });

    try {
      const resultsArray = await Promise.all(allPromises);
      const allResults = resultsArray.flat().slice(0, 6);
      return allResults;
    } catch (error) {
      console.error('Multi-source search error:', error);
      return [];
    }
  };

  // Effects (TODOS CORRIGIDOS)
  useEffect(() => {
    const analysis = analyzeResearchIntent(input);
    setResearchQuery(analysis.query);
    setIsResearching(analysis.needsResearch);
  }, [input]);

  useEffect(() => {
    const savedId = localStorage.getItem('aura_ai_last_id');
    if (savedId) setUserId(savedId);
  }, []);

  useEffect(() => {
    if (!userId && input.trim()) {
      const timeoutId = setTimeout(() => {
        const candidateId = input.toLowerCase().match(/^[a-zA-Z0-9_]+/);
        if (candidateId) {
          setUserId(candidateId[0]);
          localStorage.setItem('aura_ai_last_id', candidateId[0]);
        }
      }, 1500);
      return () => clearTimeout(timeoutId);
    }
  }, [input, userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, isTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const exportarParaPDF = (messages: Message[]) => {
    if (!messages.length) return;
    
    const ultimaMsg = messages[messages.length - 1];
    const doc = new jsPDF();
    
    doc.setFillColor(63, 97, 252);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("🧠 AURA IA - UNINTA TIANGUÁ", 20, 22);
    doc.setFontSize(11);
    doc.text(`Campus Tianguá | ${new Date().toLocaleDateString('pt-BR')} | ID: ${userId.toUpperCase()}`, 20, 32);
    
    let yPosition = 50;
    doc.setTextColor(30, 30, 30);
    
    const cleanText = ultimaMsg.content.replace(/[*#]/g, '');
    const splitText = doc.splitTextToSize(cleanText, 180);
    doc.setFontSize(12);
    doc.text(splitText, 15, yPosition);
    yPosition += (splitText.length * 6) + 20;

    if (ultimaMsg.sources?.length) {
      doc.setFontSize(16);
      doc.setTextColor(60, 60, 60);
      doc.text("📚 REFERÊNCIAS ACADÊMICAS", 15, yPosition);
      yPosition += 20;

      ultimaMsg.sources.forEach((source, idx) => {
        if (yPosition > 260) {
          doc.addPage();
          yPosition = 25;
        }
        
        const icon = {
          'wikipedia': '📖', 'scielo': '🔬', 'pubmed': '🧬', 
          'arxiv': '📄', 'scholar': '🎓', 'uninta': '🏫'
        }[source.type] || '📚';
        
        doc.setFontSize(13);
        doc.setTextColor(40, 100, 200);
        doc.text(`${icon} ${source.type.toUpperCase()}`, 15, yPosition);
        yPosition += 12;
        
        doc.setFontSize(11);
        doc.setTextColor(30, 30, 30);
        doc.text(`${idx + 1}. ${source.title.substring(0, 65)}${source.title.length > 65 ? '...' : ''}`, 18, yPosition);
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        const shortUrl = source.url.replace(/^https?:\/\//, '').substring(0, 85);
        doc.text(shortUrl, 20, yPosition + 5);
        yPosition += 16;
      });
    }
    
    doc.save(`aura_uninta_${userId || 'tiangua'}_${Date.now()}.pdf`);
  };

  const activeConversation = conversations.find(c => c.id === activeConvId) || conversations[0];
  const messages = activeConversation.messages;

  const addMessage = (role: "user" | "assistant", content: string, sources?: Message['sources'], researchQuery?: string, contextType?: Message['contextType']) => {
    const msg: Message = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date(),
      sources,
      researchQuery,
      contextType
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

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = input.trim();
    const analysis = analyzeResearchIntent(userMsg);
    
    addMessage("user", userMsg, undefined, undefined, analysis.contextType);
    setInput("");
    setIsTyping(true);

    try {
      const idParaBusca = userId || userMsg.slice(0, 20).toLowerCase();
      const historico = await buscarDoRedis(idParaBusca);
      
      let contexto = `AURA IA - UNINTA TIANGUÁ | ID: ${idParaBusca}

🧠 MODO: ${analysis.contextType?.toUpperCase() || 'CONVERSACIONAL'}

`;

      if (analysis.contextType === 'uninta') {
        contexto += `🏫 MODO UNINTA TIANGUÁ:
- Fale sobre campus, professores, estrutura
- Seja recepcionista acolhedor`;
      } else if (analysis.contextType === 'academic') {
        contexto += `🎓 MODO ACADÊMICO:
- PhD Psicologia/Neurociência UNINTA
- Estruture: Conceito → Evidências → Aplicação`;

      } else {
        contexto += `💬 MODO CONVERSACIONAL:
- Converse sobre psicologia/neurociência`;
      }

      contexto += `

📚 HISTÓRICO:
${historico.slice(-4).join("\n")}

❓: ${userMsg}`;

      let sources: Message['sources'] = [];

      if (analysis.needsResearch && analysis.prioritySources.length > 0) {
        sources = await searchSources(analysis.query, analysis.prioritySources);
        const fontesTexto = sources.map((s, i) => 
          `${s.citation} "${s.title.substring(0, 60)}..." [${s.type.toUpperCase()}]`
        ).join('\n');
        contexto += `\n\n📚 FONTES (${sources.length}):\n${fontesTexto}`;
      }

      const resposta = await analisarComGroq(userMsg, contexto);
      
      addMessage("assistant", resposta, sources.length ? sources : undefined, analysis.query, analysis.contextType);
      
      await salvarNoRedis(idParaBusca, 
        `T:${analysis.contextType} | U: ${userMsg} | A: ${resposta} | S: ${JSON.stringify(sources)}`
      );
      falarTexto(resposta);
    } catch (error) {
      console.error('Erro:', error);
      addMessage("assistant", 
        `⚠️ Erro nas sinapses. Tente novamente!\n\n💡 UNINTA:\n• "Oi, fale sobre Tianguá"\n• "Pesquise ansiedade SciELO"\n• "Professores psicologia?"`, 
        undefined, undefined, 'reception'
      );
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
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[50%] h-[50%] bg-gradient-to-l from-accent/10 to-primary/10 rounded-full blur-[120px] animate-pulse delay-1000" />
        <div className="absolute top-20 right-20 w-16 h-16 bg-white/5 rounded-2xl border border-white/20 flex items-center justify-center">
          <Building2 className="text-primary/30" size={24} />
        </div>
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
            <div className="flex items-center gap-2 p-2 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
              <GraduationCap size={18} className="text-primary" />
              <Building2 size={16} className="text-secondary" />
            </div>
            <div>
              <h1 className="text-xs font-mono font-bold tracking-[0.3em] text-primary uppercase">AURA</h1>
              <p className="text-[9px] font-mono tracking-widest text-slate-400 uppercase">UNINTA TIANGUÁ LAB</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => exportarParaPDF(messages)}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-1 text-xs"
              title="Exportar PDF"
            >
              <FileText size={16} />
              <span>PDF</span>
            </button>
            <button 
              onClick={toggleVoice} 
              className={`p-2 rounded-full transition-all ${
                audioAnalyzer.isActive 
                  ? "bg-red-500/20 text-red-500 animate-pulse border-2 border-red-500/30" 
                  : "hover:bg-white/5"
              }`}
              title="Modo Voz"
            >
              {audioAnalyzer.isActive ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-8">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center space-y-8 text-center">
              <div className="w-28 h-28 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 rounded-3xl flex items-center justify-center border-2 border-primary/20">
                <div className="text-center">
                  <Brain size={36} className="text-primary mx-auto mb-2" />
                  <GraduationCap size={20} className="text-secondary" />
                </div>
              </div>
              <div className="max-w-md space-y-3">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  🧠 Aura IA
                </h2>
                <p className="text-slate-300 text-lg">Assistente da <span className="font-bold text-primary">UNINTA Tianguá</span></p>
                <p className="text-slate-500 max-w-md leading-relaxed">
                  Psicologia, Neurociência e recepção acadêmica.
                </p>
                <div className="flex flex-wrap gap-2 justify-center text-xs text-slate-400">
                  <span>🎓 "Pesquise ansiedade SciELO"</span>
                  <span>🏫 "Fale sobre UNINTA"</span>
                  <span>👋 "Oi, tudo bem?"</span>
                </div>
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
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[85%] p-6 rounded-3xl shadow-2xl backdrop-blur-xl ${
                      msg.role === "user" 
                        ? "bg-gradient-to-r from-primary/90 to-secondary/90 text-white border border-primary/30" 
                        : "bg-white/8 border border-white/10"
                    }`}>
                      {msg.contextType && (
                        <div className="mb-3 flex items-center gap-2">
                          {msg.contextType === 'uninta' && (
                            <div className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded-full border border-yellow-500/30">
                              <Building2 size={10} /> UNINTA
                            </div>
                          )}
                          {msg.contextType === 'academic' && (
                            <div className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/30">
                              <GraduationCap size={10} /> ACADÊMICO
                            </div>
                          )}
                          {msg.contextType === 'reception' && (
                            <div className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold rounded-full border border-blue-500/30">
                              <Users size={10} /> RECEPÇÃO
                            </div>
                          )}
                        </div>
                      )}
                      
                      <ReactMarkdown className="prose prose-invert prose-sm max-w-none leading-relaxed">
                        {msg.content}
                      </ReactMarkdown>
                      
                      {msg.sources && msg.sources.length > 0 && msg.role === "assistant" && (
                        <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                              <BookOpen size={14} /> {msg.sources.length} Referências
                            </p>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {msg.sources.map(s => s.type[0].toUpperCase()).join(' ')}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {msg.sources.map((source, idx) => (
                              <a 
                                key={idx}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-start gap-3 p-3 rounded-2xl bg-gradient-to-r from-white/5 to-white/2 hover:from-primary/10 hover:to-secondary/10 border border-white/10 hover:border-primary/30 transition-all hover:shadow-xl"
                              >
                                <div className={`p-2.5 rounded-xl text-white transition-all group-hover:scale-110 flex-shrink-0 ${
                                  {
                                    'wikipedia': 'bg-blue-500/20', 
                                    'scielo': 'bg-emerald-500/20',
                                    'pubmed': 'bg-purple-500/20',
                                    'arxiv': 'bg-orange-500/20',
                                    'scholar': 'bg-indigo-500/20',
                                    'uninta': 'bg-yellow-500/20'
                                  }[source.type] || 'bg-gray-500/20'
                                }`}>
                                  {source.type === 'wikipedia' && <Globe size={14} />}
                                  {source.type === 'scielo' && <FileText size={14} />}
                                  {source.type === 'pubmed' && <Zap size={14} />}
                                  {source.type === 'arxiv' && <BookOpen size={14} />}
                                  {source.type === 'scholar' && <GraduationCap size={14} />}
                                  {source.type === 'uninta' && <Building2 size={14} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs font-semibold text-white truncate pr-2">{source.title}</p>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all ml-2">
                                      <ExternalLink size={10} />
                                      <span className="text-[10px] font-mono text-slate-400">{source.reliability}</span>
                                    </div>
                                  </div>
                                  <p className="text-[10px] text-slate-400 line-clamp-2 leading-tight">{source.snippet}</p>
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
                  <div className="bg-white/5 border border-white/10 p-5 rounded-3xl backdrop-blur-xl shadow-2xl">
                    <TypingIndicator />
                    <p className="text-xs text-slate-400 mt-2 font-mono tracking-wider text-center">
                      Processando UNINTA...
                    </p>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <footer className="p-6 relative">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex items-end gap-2 bg-white/5 border border-white/10 rounded-3xl p-3 backdrop-blur-3xl focus-within:border-primary/50 hover:border-primary/30 transition-all shadow-2xl hover:shadow-primary/10">
              <button className="p-3 text-slate-400 hover:text-primary transition-all hover:rotate-90" title="Ferramentas">
                <Plus size={20} />
              </button>
              
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre UNINTA, pesquise SciELO ou converse..."
                className="flex-1 bg-transparent border-0 focus:ring-0 text-sm p-3 resize-none outline-none max-h-[200px] text-slate-200"
                rows={1}
              />

              <button 
                onClick={handleSend}
                disabled={isTyping || !input.trim()}
                className={`p-3 rounded-2xl transition-all flex-shrink-0 ${
                  input.trim() && !isTyping 
                    ? "bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20 hover:scale-105" 
                    : "bg-white/5 text-slate-500 cursor-not-allowed"
                }`}
              >
                {isTyping ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-500 mt-3 font-medium">
              AURA IA v3.1 | UNINTA Tianguá | Multi-fonte: SciELO/Wiki/PubMed | ID: {userId || 'Guest'}
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
                {isTyping ? "PROCESSANDO..." : "AURA OUVINDO..."}
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
