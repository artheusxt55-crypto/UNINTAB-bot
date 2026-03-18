import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, BookOpen, Link2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import NeuralOrb from "@/components/NeuralOrb";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";
import ChatSidebar from "@/components/ChatSidebar";
import { salvarNoRedis, buscarDoRedis, falarTexto } from "@/lib/aura-engine";
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
      `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
      { 
        cache: 'no-cache',
        headers: { 'Accept': 'application/json' }
      }
    );
    if (response.ok) {
      const data = await response.json();
      return [{
        title: data.title || 'Wikipedia',
        url: data.content_urls?.desktop?.page || `#`,
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
      return (data.records || []).slice(0, 3).map((item: any) => ({
        title: item.title?.[0] || 'SciELO Article',
        url: item.link?.[0] || '#',
        type: "scielo"
      })) as Source[];
    }
  } catch (error) {
    console.warn("SciELO search failed:", error);
  }
  return [];
}

// ✅ FUNÇÕES DE BUSCA CORRIGIDAS E TESTADAS
async function buscarWikipedia(query: string): Promise<Source[]> {
  try {
    // Proxy para evitar CORS
    const proxyUrl = `https://api.allorigins.win/raw?url=` + 
      encodeURIComponent(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`);
    
    const searchResponse = await fetch(proxyUrl, { cache: 'no-cache' });
    const searchData = await searchResponse.json();
    
    const pageId = searchData.query?.search?.[0]?.pageid;
    if (!pageId) return [];
    
    const summaryProxyUrl = `https://api.allorigins.win/raw?url=` + 
      encodeURIComponent(`https://pt.wikipedia.org/api/rest_v1/page/summary/${pageId}`);
    
    const summaryResponse = await fetch(summaryProxyUrl);
    const data = await summaryResponse.json();
    
    console.log('✅ WIKI:', data.title);
    return [{
      title: data.title || 'Wikipedia',
      url: data.content_urls?.desktop?.page || '#',
      type: "wikipedia"
    }];
  } catch (error) {
    console.warn("Wikipedia failed:", error);
    return [];
  }
}

async function buscarScielo(query: string): Promise<Source[]> {
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=` + 
      encodeURIComponent(`https://search.scielo.org/?q=${encodeURIComponent(query)}&lang=pt&count=3&from=0&output=site&sort=&format=summary&fb=&page=1`);
    
    const response = await fetch(proxyUrl);
    const text = await response.text();
    const data = JSON.parse(text);
    
    const sources = (data.records || []).slice(0, 3).map((item: any) => ({
      title: item.title?.[0] || 'SciELO Article',
      url: item.link?.[0] || '#',
      type: "scielo"
    })).filter(s => s.url !== '#') as Source[];
    
    console.log('✅ SCIelo:', sources.length);
    return sources;
  } catch (error) {
    console.warn("SciELO failed:", error);
    return [];
  }
}

async function buscarPubMed(query: string): Promise<Source[]> {
  try {
    const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=3&retmode=json`;
    const response = await fetch(esearchUrl);
    const data = await response.json();
    const idList = data.esearchresult?.idlist || [];
    
    if (!idList.length) return [];
    
    const esummaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${idList.join(',')}&retmode=json`;
    const summaryResponse = await fetch(esummaryUrl);
    const summaryData = await summaryResponse.json();
    
    const sources: Source[] = idList.map((uid: string) => {
      const doc = summaryData.result[uid]?.[0];
      return doc ? {
        title: doc.title || 'PubMed Article',
        url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
        type: "pubmed"
      } : null;
    }).filter(Boolean) as Source[];
    
    console.log('✅ PubMed:', sources.length);
    return sources.slice(0, 3);
  } catch (error) {
    console.warn("PubMed failed:", error);
    return [];
  }
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

function SourceIcon({ type }: { type: Source["type"] }) {
  const size = 16;
  const commonClasses = "shrink-0 transition-all group-hover:scale-110 group-hover:rotate-3";

  switch (type) {
    case "wikipedia":
      return <svg className={`${commonClasses} text-blue-400`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>;
    case "scielo":
      return <svg className={`${commonClasses} text-green-400`} fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-8l-3.86 2.14-.82-1.31L9 13l-2.92-2.01L6 13l-1.5-1.5L9 7l4 2.67z"/></svg>;
    case "pubmed":
      return <svg className={`${commonClasses} text-red-400`} fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/><circle cx="12" cy="13" r="1.5"/></svg>;
    case "scholar":
      return <svg className={`${commonClasses} text-yellow-400`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>;
    default:
      return <Link2 className={`${commonClasses} text-gray-400`} size={size} />;
  }
}

function SourceCard({ source }: { source: Source }) {
  return (
    <motion.a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all duration-300 hover:shadow-[0_8px_32px_rgba(255,255,255,0.15)] hover:-translate-y-1 max-w-full hover:border-primary/30"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-primary/20 to-secondary/20 border-2 border-white/20 backdrop-blur-sm shadow-lg">
        <SourceIcon type={source.type} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white/95 text-sm leading-tight group-hover:text-primary line-clamp-2 transition-colors">
          {source.title}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className="px-2 py-1 bg-white/10 text-xs font-bold uppercase tracking-wider rounded-full text-primary/90 border border-primary/30 group-hover:bg-primary/20 transition-all">
            {source.type === "wikipedia" && "WIKI"}
            {source.type === "scielo" && "SCIELO"}
            {source.type === "pubmed" && "PUBMED"}
            {source.type === "scholar" && "📚 LIVRO LAB"} {/* ✅ ATUALIZADO */}
          </span>
          <span className="text-xs text-muted-foreground/80 font-mono tracking-tight flex items-center gap-1 group-hover:text-primary/80 transition-colors">
            <Link2 size={10} /> Abrir artigo
          </span>
        </div>
      </div>
    </motion.a>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-20">
      <div className="mb-8 opacity-80 scale-90 drop-shadow-2xl">
        <NeuralOrb 
          isActive={false} 
          volume={0} 
          frequency={0} 
          isProcessing={false} 
          size="md" 
        />
      </div>
      <h2 className="text-3xl font-semibold tracking-tight text-white/90">
        Como posso ajudar?
      </h2>
      <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground/40 mt-3 italic">
        Lab Neuro-UNINTA // Assistant Online
      </p>
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-secondary/10 rounded-full blur-3xl -z-10 opacity-60" />
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

  // Carregar userId do localStorage
  useEffect(() => {
    const savedId = localStorage.getItem('untbot_last_id');
    if (savedId) {
      setUserId(savedId);
    }
  }, []);

  const exportarParaPDF = (texto: string) => {
    try {
      const doc = new jsPDF();
      doc.setFillColor(227, 6, 19);
      doc.rect(0, 0, 210, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text("UNINTA - RELATÓRIO DE SINAPSE NEURAL", 15, 16);
      doc.setFontSize(8);
      doc.text(`ID: ${userId.toUpperCase()} | DATA: ${new Date().toLocaleDateString('pt-BR')}`, 140, 16);
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(11);
      const cleanText = texto.replace(/[*#`]/g, '').replace(/\n/g, ' ');
      const splitText = doc.splitTextToSize(cleanText, 180);
      doc.text(splitText, 15, 40);
      doc.save(`sinapse_${userId || 'lab'}_${Date.now()}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConvId) || conversations[0];
  const messages = activeConversation.messages;

  // Scroll automático APENAS quando há mensagens
  useEffect(() => {
    if (messages.length > 0 || isTyping) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const addMessage = (role: "user" | "assistant", content: string, sources?: Source[], isResearch?: boolean) => {
    const msg: Message = { 
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9), 
      role, 
      content, 
      timestamp: new Date(),
      ...(sources && sources.length > 0 && { sources }),
      ...(isResearch && { isResearch })
    };
    
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConvId) return c;
        const updatedMessages = [...c.messages, msg];
        const updated = { 
          ...c, 
          messages: updatedMessages 
        };
        
        // Atualizar título se for a primeira mensagem do usuário
        if (role === "user" && c.messages.length === 0) {
          updated.title = content.slice(0, 40) + (content.length > 40 ? "..." : "");
        }
        return updated;
      })
    );
  };

  // ✅ handleSend ATUALIZADO COM NOVA API
  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = input.trim();
    let currentUserId = userId;

    // Definir userId se ainda não foi definido
    if (!currentUserId) {
      currentUserId = userMsg.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (currentUserId) {
        setUserId(currentUserId);
        localStorage.setItem('untbot_last_id', currentUserId);
      }
    }

    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);

    try {
      const idParaBusca = currentUserId || userMsg.toLowerCase().replace(/[^a-z0-9]/g, '');
      const historico = await buscarDoRedis(idParaBusca).catch(() => [] as string[]);
      
      const ePesquisa = detectarPesquisa(userMsg);
      let webSources: Source[] = []; // Fontes da web
      let contextualInfo = historico.slice(-5).join(" | ");

      // ✅ MANTER LÓGICA DE DETECÇÃO DE PESQUISA E BUSCAS NA WEB
      if (ePesquisa) {
        const contextoPesquisa = `Você é a Aura AI do Lab Neuro-UNINTA em MODO PESQUISA ACADÊMICA. 
        Mestre: Matheus. Operador: ${idParaBusca}. 
        Histórico: ${contextualInfo}.
        Você encontrou fontes acadêmicas confiáveis. Responda de forma técnica e cite as fontes encontradas.
        NÃO invente informações. Baseie-se nas fontes reais.`;

        // Buscar fontes da web (Wikipedia, SciELO, PubMed)
        const [wikiSources, scieloSources, pubmedSources] = await Promise.allSettled([
          buscarWikipedia(userMsg),
          buscarScielo(userMsg),
          buscarPubMed(userMsg)
        ]).then((results) => 
          results.map((result) => 
            result.status === 'fulfilled' ? result.value : []
          ) as Source[][]
        );
        
        webSources = [...wikiSources, ...scieloSources, ...pubmedSources].flat().slice(0, 5);
        contextualInfo = contextoPesquisa;
      } else {
                contextualInfo = `Você é a Aura AI do Lab Neuro-UNINTA. Mestre: Matheus. Operador: ${idParaBusca}. Histórico: ${contextualInfo}`;
      }

  // 👇 SUBSTITUA o bloco inteiro do fetch por este:
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: userMsg,
    contexto: contextualInfo,
    query_search: userMsg,        // ← SEMPRE enviar!
    web_sources: ePesquisa ? webSources : []  // ← Vazio se não pesquisa
  }),
});
      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status}`);
      }

      const apiData = await response.json();
      const resposta = apiData.resposta || apiData.content || "Resposta não encontrada";

      // ✅ COMBINAR FONTES: Web + fontesLab (Supabase)
      let allSources: Source[] = [...webSources];
      
      if (apiData.fontesLab && Array.isArray(apiData.fontesLab)) {
        const labSources: Source[] = apiData.fontesLab.map((labItem: any) => ({
          title: labItem.title || 'Livro Lab Neuro-UNINTA',
          url: labItem.url_pdf || '#',
          type: 'scholar' as const
        })).slice(0, 5); // Limitar a 5 fontes lab
        
        allSources = [...allSources, ...labSources];
      }

      // ✅ Manter funções existentes
      await salvarNoRedis(idParaBusca, `U: ${userMsg} | B: ${resposta}`).catch(console.error);
      addMessage("assistant", resposta, allSources, ePesquisa);
      
      // Falar texto
      falarTexto(resposta).catch(console.error);
      
    } catch (error) {
      console.error('Erro na comunicação:', error);
      addMessage("assistant", "⚠️ Erro de conexão neural. Verifique sua conexão e tente novamente.", [], false);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

      <div className={`flex-1 flex flex-col min-w-0 relative z-10 transition-all duration-500 ${
        sidebarOpen 
          ? "blur-md scale-[0.98] pointer-events-none lg:blur-none lg:scale-100 lg:pointer-events-auto" 
          : ""
      }`}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-background/40 backdrop-blur-xl">
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground lg:hidden"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]"></span>
            </div>
            <h1 className="text-xs font-bold font-mono tracking-[0.2em] text-primary uppercase text-glow">
              UNINTA // {userId || "AGUARDANDO_ID"}
            </h1>
          </div>
          <button 
            onClick={() => {
              const id = Date.now().toString();
              setConversations(prev => [{ 
                id, 
                title: "Nova conversa", 
                messages: [], 
                createdAt: new Date() 
              }, ...prev]);
              setActiveConvId(id);
            }} 
            className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground"
            title="Nova conversa"
          >
            <Plus size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto chat-scrollbar relative scroll-smooth px-4 bg-gradient-to-b from-transparent to-black/20">
          {!messages.length ? (
            <EmptyState />
          ) : (
            <div className="max-w-3xl mx-auto w-full py-10 space-y-8">
              <AnimatePresence mode="popLayout">
                {messages.map((msg) => (
                  <motion.div 
                    key={msg.id} 
                    initial={{ opacity: 0, y: 10 }} 
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
                        <Zap size={14} className="text-primary animate-pulse" />
                      </div>
                    )}
                    <div className={`p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed backdrop-blur-md border shadow-2xl ${
                      msg.role === "user" 
                        ? "bg-primary/90 text-primary-foreground border-primary/20" 
                        : "bg-white/5 border-white/10 text-white/90"
                    }`}>
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ node, children, ...props }) => (
                            <a 
                              {...props} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80 underline flex items-center gap-1 transition-all group"
                            >
                              {children}
                              <span className="opacity-0 group-hover:opacity-100 transition-all ml-1">↗</span>
                            </a>
                          )
                        }}
                        className="prose prose-invert prose-sm max-w-none prose-headings:font-bold prose-a:text-primary prose-a:underline"
                      >
                        {msg.content}
                      </ReactMarkdown>
                      
                      {/* CARDS DE REFERÊNCIAS ACADÊMICAS */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-white/10">
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-2 mb-6 text-xs uppercase font-bold tracking-wider text-primary/80 font-mono"
                          >
                            <BookOpen size={14} className="shrink-0" />
                            <span>REFERÊNCIAS ACADÊMICAS ENCONTRADAS</span>
                          </motion.div>
                          <div className="space-y-3 max-h-48 overflow-y-auto chat-scrollbar pr-2">
                            {msg.sources.map((source, index) => (
                              <motion.div
                                key={`${msg.id}-${index}`}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                              >
                                <SourceCard source={source} />
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* BOTÃO PDF INTEGRADO */}
                      {msg.role === 'assistant' && (
                        <motion.button 
                          onClick={() => exportarParaPDF(msg.content)} 
                          className="mt-4 flex items-center gap-2 text-[10px] bg-white/5 hover:bg-primary/20 p-2.5 rounded-xl border border-white/10 transition-all uppercase font-bold tracking-tighter shadow-sm hover:shadow-md w-full justify-center"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <FileText size={12} /> Gerar Relatório PDF
                        </motion.button>
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
                className={`p-2.5 rounded-xl transition-all ${
                  audioAnalyzer.isActive 
                    ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.5)]" 
                    : "text-muted-foreground hover:bg-white/5"
                }`}
                title={audioAnalyzer.isActive ? "Parar áudio" : "Ativar áudio"}
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
                disabled={isTyping}
                style={{ 
                  border: 'none', 
                  boxShadow: 'none', 
                  outline: 'none', 
                  background: 'transparent',
                  resize: 'none'
                }}
                className="flex-1 bg-transparent border-0 focus:border-0 focus:ring-0 focus:outline-none resize-none text-sm py-2.5 placeholder:text-muted-foreground/30 font-sans chat-scrollbar overflow-y-auto shadow-none outline-none appearance-none text-white selection:bg-primary/40 min-h-[20px]" 
              />
              
              <button 
                onClick={handleSend} 
                disabled={!input.trim() || isTyping} 
                className="p-2.5 bg-primary text-primary-foreground rounded-xl disabled:opacity-20 disabled:cursor-not-allowed shadow-lg active:scale-95 transition-all group hover:shadow-[0_0_20px_rgba(var(--primary),0.4)]"
                title="Enviar mensagem"
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
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-8"
          >
            <NeuralOrb 
              isActive={audioAnalyzer.isActive} 
              volume={audioAnalyzer.volume} 
              frequency={audioAnalyzer.frequency} 
              isProcessing={audioAnalyzer.isProcessing}
              size="lg"
            />
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-white/80 text-sm mt-6 font-mono tracking-wide"
            >
              {audioAnalyzer.isProcessing ? "Processando..." : "Ouvindo..."}
            </motion.p>
            <button 
              onClick={toggleVoice} 
              className="mt-12 p-5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white transition-all shadow-[0_0_30px_rgba(var(--destructive),0.2)] active:scale-95"
              title="Parar gravação"
            >
              <MicOff size={24} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
