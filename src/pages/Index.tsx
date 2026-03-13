import { useState, useRef, useEffect, KeyboardEvent, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Mic, MicOff, Plus, X, Menu, Loader2, FileText, BookOpen,
  Globe, GraduationCap, Brain, ExternalLink, Building2, MessageSquare, Search, Zap, Users
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { jsPDF } from "jspdf";

// ═══════════════════════════════════════════════════════════════
// IMPORTS DO CÓDIGO 2 (FUNÇÕES REAIS)
// ═══════════════════════════════════════════════════════════════
import { analisarComGroq, salvarNoRedis, buscarDoRedis, falarTexto } from "@/lib/aura-engine";

// ═══════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════

interface Source {
  type: 'wikipedia' | 'scielo' | 'pubmed' | 'arxiv' | 'scholar' | 'uninta';
  title: string;
  url: string;
  snippet: string;
  citation?: string;
  reliability?: 'high' | 'medium' | 'low';
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: Source[];
  researchQuery?: string;
  contextType?: 'academic' | 'conversational' | 'uninta' | 'reception';
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// HOOK: useAudioAnalyzer
// ═══════════════════════════════════════════════════════════════

function useAudioAnalyzer() {
  const [isActive, setIsActive] = useState(false);
  const [volume, setVolume] = useState(0);
  const [frequency, setFrequency] = useState(0);
  const animFrameRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      setIsActive(true);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setVolume(avg / 255);
        const maxIdx = dataArray.indexOf(Math.max(...dataArray));
        setFrequency(maxIdx / dataArray.length);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { console.error('Mic error:', e); }
  }, []);

  const stop = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setIsActive(false);
    setVolume(0);
    setFrequency(0);
  }, []);

  return { isActive, volume, frequency, start, stop };
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTES UI
// ═══════════════════════════════════════════════════════════════

function NeuralOrb({ isActive, volume, frequency, isProcessing }: { isActive: boolean; volume: number; frequency: number; isProcessing: boolean }) {
  const scale = 1 + volume * 0.5;
  return (
    <div className="relative w-48 h-48 flex items-center justify-center">
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.25) 0%, transparent 70%)' }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.div
        className="w-32 h-32 rounded-full"
        style={{
          background: 'radial-gradient(circle at 40% 40%, rgba(220,38,38,0.9), rgba(127,29,29,0.8), rgba(0,0,0,1))',
          boxShadow: '0 0 30px rgba(220,38,38,0.3), 0 0 60px rgba(220,38,38,0.1)',
        }}
        animate={{ scale: isActive ? scale : 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      />
      {isProcessing && (
        <motion.div
          className="absolute w-40 h-40 rounded-full border border-red-600/30"
          animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Brain size={18} style={{ color: '#dc2626', filter: 'drop-shadow(0 0 8px rgba(220,38,38,0.5))' }} />
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2.5 h-2.5 rounded-full"
            style={{
              backgroundColor: '#dc2626',
              boxShadow: '0 0 8px rgba(220,38,38,0.6), 0 0 16px rgba(220,38,38,0.3)',
            }}
            animate={{
              y: [0, -10, 0],
              opacity: [0.4, 1, 0.4],
              boxShadow: [
                '0 0 4px rgba(220,38,38,0.3)',
                '0 0 12px rgba(220,38,38,0.8), 0 0 24px rgba(220,38,38,0.4)',
                '0 0 4px rgba(220,38,38,0.3)',
              ],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <span style={{ color: '#737373', fontSize: '12px' }}>Processando UNINTA...</span>
    </div>
  );
}

function ResearchStatus({ isResearching, query, sourcesCount }: { isResearching: boolean; query?: string; sourcesCount?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      style={{
        background: 'rgba(220,38,38,0.08)',
        border: '1px solid rgba(220,38,38,0.15)',
        borderRadius: '12px',
        padding: '10px 16px',
        margin: '0 0 12px 0',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      {isResearching && (
        <Loader2 size={14} style={{ color: '#dc2626', animation: 'spin 1s linear infinite' }} />
      )}
      <span style={{ color: '#a3a3a3', fontSize: '12px' }}>
        {isResearching
          ? <span>Pesquisando <strong>"{query?.slice(0, 30) || ''}{query && query.length > 30 ? '...' : ''}"</strong></span>
          : <span>✅ {sourcesCount || 0} fontes encontradas</span>
        }
      </span>
    </motion.div>
  );
}

function ChatSidebar({ conversations, activeId, onSelect, onNew, isOpen, onClose }: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 40,
              background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
            }}
            className="lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        style={{
          position: isOpen ? 'fixed' : 'relative',
          top: 0, left: 0, height: '100%', width: '260px',
          background: '#080808',
          borderRight: '1px solid #1a1a1a',
          display: 'flex', flexDirection: 'column',
          zIndex: 50,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 300ms',
        }}
        className={`fixed lg:relative ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1a1a1a' }}>
          <button
            onClick={onNew}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
              color: '#a3a3a3', background: 'transparent', border: 'none',
              cursor: 'pointer', width: '100%', textAlign: 'left',
              transition: 'background 200ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#141414')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Plus size={16} style={{ color: '#dc2626' }} />
            <span>Nova conversa</span>
          </button>
          <button onClick={onClose} className="lg:hidden" style={{ padding: '6px', borderRadius: '6px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#a3a3a3' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              style={{
                width: '100%', textAlign: 'left',
                padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
                marginBottom: '2px', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
                background: conv.id === activeId ? '#141414' : 'transparent',
                color: conv.id === activeId ? '#e5e5e5' : '#737373',
                transition: 'all 200ms',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}
              onMouseEnter={e => { if (conv.id !== activeId) e.currentTarget.style.background = '#0f0f0f'; }}
              onMouseLeave={e => { if (conv.id !== activeId) e.currentTarget.style.background = 'transparent'; }}
            >
              <MessageSquare size={14} style={{ color: conv.id === activeId ? '#dc2626' : '#525252', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.title}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '12px', borderTop: '1px solid #1a1a1a', textAlign: 'center' }}>
          <p style={{ fontSize: '10px', color: '#525252' }}>AURA IA v3.1 • UNINTA</p>
        </div>
      </aside>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// LÓGICA DE RESEARCH
// ═══════════════════════════════════════════════════════════════

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

const fetchWikipedia = async (query: string, searchCache: Map<string, Source[]>, setSearchCache: (cache: Map<string, Source[]>) => void): Promise<Source[]> => {
  try {
    const cacheKey = `wiki_${query}`;
    if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;
    
    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=2&origin=*`
    );
    const data = await response.json();
    
    const results: Source[] = data.query?.search?.slice(0, 2).map((item: any, idx: number) => ({
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

const fetchScielo = async (query: string, searchCache: Map<string, Source[]>, setSearchCache: (cache: Map<string, Source[]>) => void): Promise<Source[]> => {
  try {
    const cacheKey = `scielo_${query}`;
    if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;
    
    const results: Source[] = [{
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

const fetchPubMed = async (query: string, searchCache: Map<string, Source[]>, setSearchCache: (cache: Map<string, Source[]>) => void): Promise<Source[]> => {
  try {
    const results: Source[] = [{
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

const fetchArxiv = async (query: string, searchCache: Map<string, Source[]>, setSearchCache: (cache: Map<string, Source[]>) => void): Promise<Source[]> => {
  try {
    const results: Source[] = [{
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

const fetchUninta = async (): Promise<Source[]> => {
  return [{
    type: 'uninta' as const,
    title: "UNINTA Tianguá - Universidade Internacional do Cariri",
    url: "https://uninta.edu.br/campus-tiangua/",
    snippet: "Campus Tianguá da UNINTA. Cursos de Psicologia, Enfermagem e mais.",
    citation: "[1]",
    reliability: 'high' as const
  }];
};

const searchSources = async (query: string, prioritySources: string[], searchCache: Map<string, Source[]>, setSearchCache: (cache: Map<string, Source[]>) => void): Promise<Source[]> => {
  const allPromises = prioritySources.map(source => {
    switch (source) {
      case 'wikipedia': return fetchWikipedia(query, searchCache, setSearchCache);
      case 'scielo': return fetchScielo(query, searchCache, setSearchCache);
      case 'pubmed': return fetchPubMed(query, searchCache, setSearchCache);
      case 'arxiv': return fetchArxiv(query, searchCache, setSearchCache);
      case 'uninta': return fetchUninta();
      case 'scholar': return Promise.resolve([] as Source[]);
      default: return Promise.resolve([] as Source[]);
    }
  });

  try {
    const resultsArray = await Promise.all(allPromises);
    return resultsArray.flat().slice(0, 6);
  } catch (error) {
    console.error('Multi-source search error:', error);
    return [];
  }
};

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL: Index
// ═══════════════════════════════════════════════════════════════

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
  const [userId, setUserId] = useState("");
  const [searchCache, setSearchCache] = useState<Map<string, Source[]>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  // Effects
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

  // PDF Export (CORRIGIDO - Sem emojis em template literals)
  const exportarParaPDF = (messages: Message[]) => {
    if (!messages.length) return;
    
    const ultimaMsg = messages[messages.length - 1];
    const doc = new jsPDF();
    
    doc.setFillColor(63, 97, 252);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("AURA IA - UNINTA TIANGUÁ", 20, 22);
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
      doc.text("REFERÊNCIAS ACADÊMICAS", 15, yPosition);
      yPosition += 20;

      ultimaMsg.sources.forEach((source, idx) => {
        if (yPosition > 260) {
          doc.addPage();
          yPosition = 25;
        }
        
        const iconMap = {
          'wikipedia': '[WIKI]', 'scielo': '[SCIELO]', 'pubmed': '[PUBMED]', 
          'arxiv': '[ARXIV]', 'scholar': '[SCHOLAR]', 'uninta': '[UNINTA]'
        };
        
        doc.setFontSize(13);
        doc.setTextColor(40, 100, 200);
        doc.text(`${iconMap[source.type] || '[SOURCE]'} ${source.type.toUpperCase()}`, 15, yPosition);
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

  const addMessage = (role: "user" | "assistant", content: string, sources?: Source[], researchQuery?: string, contextType?: Message['contextType']) => {
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

  // HANDLE SEND COM FUNÇÕES REAIS
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

MODO: ${analysis.contextType?.toUpperCase() || 'CONVERSACIONAL'}

`;

      if (analysis.contextType === 'uninta') {
        contexto += `MODO UNINTA TIANGUÁ:
- Fale sobre campus, professores, estrutura
- Seja recepcionista acolhedor`;
      } else if (analysis.contextType === 'academic') {
        contexto += `MODO ACADÊMICO:
- PhD Psicologia/Neurociência UNINTA
- Estruture: Conceito → Evidências → Aplicação`;
      } else {
        contexto += `MODO CONVERSACIONAL:
- Converse sobre psicologia/neurociência`;
      }

      contexto += `

HISTÓRICO:
${historico.slice(-4).join("\n")}

PERGUNTA: ${userMsg}`;

      let sources: Source[] = [];

      if (analysis.needsResearch && analysis.prioritySources.length > 0) {
        sources = await searchSources(analysis.query, analysis.prioritySources, searchCache, setSearchCache);
        const fontesTexto = sources.map((s, i) => 
          `${s.citation} "${s.title.substring(0, 60)}..." [${s.type.toUpperCase()}]`
        ).join('\n');
        contexto += `\n\nFONTES (${sources.length}):\n${fontesTexto}`;
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
        `Erro nas sinapses. Tente novamente!

SUGESTÕES UNINTA:
- "Oi, fale sobre Tianguá"
- "Pesquise ansiedade SciELO" 
- "Professores psicologia?"`, 
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

  const sourceIcon = (type: Source['type']) => {
    const map: Record<string, JSX.Element> = {
      wikipedia: <Globe size={14} />, scielo: <BookOpen size={14} />,
      pubmed: <GraduationCap size={14} />, arxiv: <FileText size={14} />,
      uninta: <Building2 size={14} />, scholar: <GraduationCap size={14} />,
    };
    return map[type] || <Globe size={14} />;
  };

  const contextBadge = (ct?: string) => {
    if (!ct || ct === 'conversational') return null;
    const labels: Record<string, string> = { uninta: 'UNINTA', academic: 'ACADÊMICO', reception: 'RECEPÇÃO' };
    return (
      <span style={{
        fontSize: '10px', padding: '2px 8px', borderRadius: '99px', fontWeight: 600,
        background: 'rgba(220,38,38,0.1)', color: '#dc2626',
      }}>
        {labels[ct] || ct}
      </span>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: '#000000',
    }}>
      {/* Gradient overlay animado */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(69,10,10,0.15) 0%, transparent 65%), radial-gradient(ellipse at 80% 100%, rgba(69,10,10,0.08) 0%, transparent 55%)',
        animation: 'bgDrift 20s ease-in-out infinite',
      }} />

      <style>{`
        @keyframes bgDrift {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1.2; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={(id) => { setActiveConvId(id); setSidebarOpen(false); }}
        onNew={() => {
          const id = Date.now().toString();
          setConversations(prev => [{ id, title: "Nova conversa", messages: [], createdAt: new Date() }, ...prev]);
          setActiveConvId(id);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', height: '48px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden" style={{ padding: '6px', borderRadius: '6px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <Menu size={18} style={{ color: '#737373' }} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Brain size={22} style={{ color: '#dc2626', filter: 'drop-shadow(0 0 10px rgba(220,38,38,0.4))' }} />
              <div>
                <h1 style={{ fontSize: '14px', fontWeight: 700, color: '#e5e5e5', lineHeight: 1, margin: 0 }}>AURA</h1>
                <p style={{ fontSize: '10px', color: '#525252', margin: 0 }}>UNINTA TIANGUÁ LAB</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => exportarParaPDF(messages)}
              style={{
                padding: '6px 12px',
                background: 'rgba(220,38,38,0.1)',
                border: '1px solid rgba(220,38,38,0.2)',
                borderRadius: '6px',
                color: '#dc2626',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              PDF
            </button>
          </div>
        </header>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <AnimatePresence>
            {isResearching && researchQuery && (
              <ResearchStatus isResearching={true} query={researchQuery} sourcesCount={0} />
            )}
            
            {messages.map((message) => (
             <motion.div
  key={message.id}
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0 }}
  style={{
    alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
    maxWidth: '80%',
  }}
>
  <div style={{
    padding: '12px 16px',
    borderRadius: '16px',
    background: message.role === 'user' 
      ? 'linear-gradient(135deg, rgba(220,38,38,0.15) 0%, rgba(127,29,29,0.2) 100%)'
      : 'rgba(255,255,255,0.03)',
    border: message.role === 'user' 
      ? '1px solid rgba(220,38,38,0.3)' 
      : '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(10px)',
    position: 'relative',
  }}>
    {contextBadge(message.contextType)}
    
    <div style={{ marginTop: '4px' }}>
      <ReactMarkdown 
        components={{
          strong: ({children}) => <strong style={{color: '#dc2626'}}>{children}</strong>,
          em: ({children}) => <em style={{fontStyle: 'italic', color: '#a3a3a3'}}>{children}</em>,
          code: ({children}) => (
            <code style={{
              background: 'rgba(220,38,38,0.1)', 
              color: '#dc2626', 
              padding: '2px 6px', 
              borderRadius: '4px',
              fontSize: '13px'
            }}>{children}</code>
          )
        }}
      >
        {message.content}
      </ReactMarkdown>
    </div>

    {message.sources && message.sources.length > 0 && (
      <div style={{ 
        marginTop: '12px', 
        paddingTop: '12px', 
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', 
        flexDirection: 'column', 
        gap: '6px' 
      }}>
        <span style={{ 
          fontSize: '11px', 
          color: '#a3a3a3', 
          fontWeight: 500 
        }}>
          📚 {message.sources.length} fontes acadêmicas
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {message.sources.map((source, idx) => (
            <a
              key={idx}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: 'rgba(220,38,38,0.1)',
                border: '1px solid rgba(220,38,38,0.2)',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#dc2626',
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(220,38,38,0.2)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(220,38,38,0.1)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {sourceIcon(source.type)}
              <span style={{ fontWeight: 500 }}>{source.citation}</span>
              <ExternalLink size={10} />
            </a>
          ))}
        </div>
      </div>
    )}

    <div style={{ 
      marginTop: '8px', 
      fontSize: '10px', 
      color: '#525252',
      opacity: 0.7 
    }}>
      {message.timestamp.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })}
      {message.researchQuery && (
        <>
          {' • '}
          <span style={{ color: '#a3a3a3' }}>
            🔍 {message.researchQuery.slice(0, 40)}{message.researchQuery.length > 40 ? '...' : ''}
          </span>
        </>
      )}
    </div>
  </div>
</motion.div>
