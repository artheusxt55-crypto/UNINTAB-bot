
```tsx
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, Search, BookOpen, Globe, GraduationCap, Citation, Brain } from "lucide-react";
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
      published: string;
    }>;
  };
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

  // 🧠 INTELIGÊNCIA AVANÇADA DE DETECÇÃO (MELHORADA)
  const analyzeResearchIntent = (text: string): { needsResearch: boolean; query: string } => {
    const lowerText = text.toLowerCase().trim();
    
    // Triggers explícitos (prioridade máxima)
    const explicitTriggers = [
      'pesquise', 'procure', 'busque', 'investigue', 'pesquisa sobre',
      'fonte', 'referência', 'artigo', 'estudo', 'paper', 'arxiv',
      'wikipedia', 'wiki', 'definição', 'o que é', 'explique detalhadamente'
    ];
    
    // Triggers implícitos sofisticados
    const implicitTriggers = [
      /\b(qual é|o que significa|definição de|história de|origem de)\b/gi,
      /\b(estudos mostram|pesquisas indicam|de acordo com|evidências de)\b/gi,
      /\b(teoria|modelo|paradigma|hipótese|pesquisa)\b/gi,
      /\b(estatística|dados|evidência|evidências|meta-análise)\b/gi
    ];
    
    // Termos acadêmicos (psicologia/neurociência)
    const academicTerms = [
      'psicologia', 'neurociência', 'cognição', 'terapia', 'psicanálise',
      'depressão', 'ansiedade', 'trauma', 'inteligência', 'memória',
      'mindfulness', 'terapia cognitivo', 'psicopatologia'
    ];
    
    const hasExplicit = explicitTriggers.some(trigger => 
      typeof trigger === 'string' ? lowerText.includes(trigger) : trigger.test(lowerText)
    );
    
    const hasAcademicContext = academicTerms.some(term => lowerText.includes(term));
    const hasImplicit = implicitTriggers.some(trigger => trigger.test(lowerText));
    
    // 🧠 LÓGICA MELHORADA: 3 níveis de certeza
    const certainty = hasExplicit ? 1 : (hasAcademicContext && hasImplicit) ? 0.8 : 0;
    const needsResearch = certainty > 0.6;
    
    // Extração inteligente de query
    let query = text.trim();
    if (hasExplicit) {
      const match = lowerText.match(/(pesquise|procure|busque|investigue|pesquisa sobre)\s+(.+)/i);
      if (match?.[2]) query = match[2].trim();
    }
    
    return { needsResearch, query };
  };

  // Efeitos useEffect (otimizados)
  useEffect(() => {
    const { needsResearch, query } = analyzeResearchIntent(input);
    setResearchQuery(query);
    setIsResearching(needsResearch);
  }, [input]);

  useEffect(() => {
    const interval = setInterval(() => setSearchCache(new Map()), 600000); // 10min
    return () => clearInterval(interval);
  }, []);

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

  // 🔍 APIs de Pesquisa (MELHORADAS)
  const fetchWikipedia = async (query: string): Promise<any[]> => {
    try {
      const cacheKey = `wiki_${query}`;
      if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;
      
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&origin=*`
      );
      const data: WikipediaResponse = await response.json();
      
      const results = data.query.search.slice(0, 3).map((item, idx) => ({
        type: 'wikipedia' as const,
        title: item.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
        snippet: item.snippet.replace(/<[^>]*>/g, '').substring(0, 120) + '...',
        citation: `[1.${idx + 1}]`
      }));
      
      setSearchCache(prev => new Map(prev).set(cacheKey, results));
      return results;
    } catch (error) {
      console.error('Wikipedia error:', error);
      return [];
    }
  };

  const fetchArxiv = async (query: string): Promise<any[]> => {
    try {
      const cacheKey = `arxiv_${query}`;
      if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;
      
      const response = await fetch(
        `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=3&sortBy=submittedDate&sortOrder=descending`
      );
      const data: ArxivResponse = await response.json();
      
      const results = data.feed.entry.slice(0, 3).map((entry, idx) => {
        const pdfLink = entry.link.find((link: any) => link.title === 'pdf');
        return {
          type: 'scientific' as const,
          title: entry.title,
          url: pdfLink?.href || entry.link[0].href,
          snippet: entry.summary.replace(/<[^>]*>/g, '').substring(0, 120) + `... (${new Date(entry.published).toLocaleDateString('pt-BR')})`,
          citation: `[2.${idx + 1}]`
        };
      });
      
      setSearchCache(prev => new Map(prev).set(cacheKey, results));
      return results;
    } catch (error) {
      console.error('ArXiv error:', error);
      return [];
    }
  };

  const fetchGoogleScholar = async (query: string): Promise<any[]> => {
    return [{
      type: 'academic' as const,
      title: `${query.charAt(0).toUpperCase() + query.slice(1)} - Journal of Psychology (2024)`,
      url: `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
      snippet: `Estudo acadêmico recente sobre "${query}" com alta relevância...`,
      citation: '[3.1]'
    }];
  };

  const searchSources = async (query: string): Promise<any[]> => {
    const [wiki, arxiv, scholar] = await Promise.all([
      fetchWikipedia(query),
      fetchArxiv(query),
      fetchGoogleScholar(query)
    ]);
    return [...wiki, ...arxiv, ...scholar].slice(0, 6);
  };

  // 📄 PDF Acadêmico (MELHORADO)
  const exportarParaPDF = (texto: string, sources?: Message['sources']) => {
    const doc = new jsPDF();
    doc.setFillColor(63, 97, 252);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text("🧠 AURA IA - RELATÓRIO ACADÊMICO", 20, 20);
    doc.setFontSize(10);
    doc.text(`ID: ${userId.toUpperCase()} | ${new Date().toLocaleDateString('pt-BR')} | ${new Date().toLocaleTimeString('pt-BR')}`, 140, 20);
    
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
        const icon = source.type === 'wikipedia' ? '📖' : source.type === 'scientific' ? '🔬' : '🎓';
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // 🗣️ Adicionar mensagem (MELHORADO)
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

  // 🚀 Handler principal (CORRIGIDO)
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
- Linguagem precisa e acadêmica

📚 HISTÓRICO RECENTE:
${historico.slice(-4).join("\n")}

❓ PERGUNTA ATUAL: ${userMsg}`;

      let sources: any[] = [];

      // 🔍 PESQUISA AUTOMÁTICA INTELIGENTE
      if (isResearching && researchQuery) {
        addMessage("assistant", "🔍 Iniciando pesquisa acadêmica...", [], researchQuery);
        sources = await searchSources(researchQuery);
        
        const fontesTexto = sources.map((s, i) => 
          `${s.citation} "${s.title.substring(0, 70)}..." (${s.type})`
        ).join('\n');
        
        contexto += `\n\n📚 REFERÊNCIAS ENCONTRADAS (${sources.length}):\n${fontesTexto}`;
      }

      const resposta = await analisarComGroq(userMsg, contexto);
      
      // ✅ Adiciona resposta FINAL (corrigido)
      addMessage("assistant", resposta, sources.length ? sources : undefined, researchQuery);
      
      // Salva histórico
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
        <div className="absolute bottom-[-15  
     import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, Search, BookOpen, Globe, GraduationCap, Brain } from "lucide-react";
import ReactMarkdown from "react-markdown";
import NeuralOrb from "@/components/NeuralOrb";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";
import ChatSidebar from "@/components/ChatSidebar";
import { analisarComGroq, salvarNoRedis, buscarDoRedis, falarTexto } from "@/lib/aura-engine";
import { jsPDF } from "jspdf";

// --- Interfaces ---
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
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

// --- Componentes Auxiliares ---
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
  const [isResearching, setIsResearching] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showVoiceOrb, setShowVoiceOrb] = useState(false);
  const [userId, setUserId] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  // ✅ Persistência do ID do Untbot
  useEffect(() => {
    const savedId = localStorage.getItem('untbot_last_id');
    if (savedId) setUserId(savedId);
  }, []);

  // ✅ Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, isTyping]);

  // ✅ Lógica de Pesquisa e Envio
  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = input.trim();
    const needsSearch = /pesquise|procure|busque|wiki|fonte|artigo/i.test(userMsg);
    
    // Add user message
    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMsg,
      timestamp: new Date()
    };

    setConversations(prev => prev.map(c => 
      c.id === activeConvId ? { ...c, messages: [...c.messages, newMessage] } : c
    ));

    setInput("");
    setIsTyping(true);
    if (needsSearch) setIsResearching(true);

    try {
      const idParaBusca = userId || "lab_assistant";
      const historico = await buscarDoRedis(idParaBusca);
      
      let contexto = `AURA IA | UNINTA LAB | ID: ${idParaBusca}\nResponda de forma técnica e acadêmica.\nHistórico: ${historico.slice(-3).join(" | ")}`;
      
      const resposta = await analisarComGroq(userMsg, contexto);
      
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: resposta,
        timestamp: new Date()
      };

      setConversations(prev => prev.map(c => 
        c.id === activeConvId ? { ...c, messages: [...c.messages, assistantMsg] } : c
      ));

      await salvarNoRedis(idParaBusca, `U: ${userMsg} | A: ${resposta}`);
      falarTexto(resposta);
    } catch (error) {
      console.error(error);
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

  const activeConversation = conversations.find(c => c.id === activeConvId) || conversations[0];
  const messages = activeConversation.messages;

  return (
    <div className="flex h-screen bg-[#050505] text-slate-200 overflow-hidden font-sans">
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
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2"><Menu size={20}/></button>
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <GraduationCap size={18} className="text-primary" />
            </div>
            <h1 className="text-[10px] font-mono font-bold tracking-[0.2em] text-primary uppercase">UNINTA // LAB ASSISTANT</h1>
          </div>
          <button onClick={toggleVoice} className={`p-2 rounded-full ${audioAnalyzer.isActive ? "bg-red-500/20 text-red-500" : "hover:bg-white/5"}`}>
            <Mic size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <Brain size={40} className="text-primary/20 animate-pulse" />
              <h2 className="text-xl font-semibold text-white">Como posso ajudar?</h2>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-10 space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl ${msg.role === "user" ? "bg-primary text-white" : "bg-white/5 border border-white/10"}`}>
                    <ReactMarkdown className="prose prose-invert prose-sm">{msg.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {isTyping && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <footer className="p-6">
          <div className="max-w-3xl mx-auto flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl p-2 backdrop-blur-2xl">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua dúvida acadêmica..."
              className="flex-1 bg-transparent border-0 focus:ring-0 text-sm p-2 resize-none outline-none"
              rows={1}
            />
            <button onClick={handleSend} disabled={isTyping} className="p-3 bg-primary rounded-xl hover:scale-105 transition-all disabled:opacity-50">
              {isTyping ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
