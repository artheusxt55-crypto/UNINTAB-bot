"use client";

import { useState, useRef, useEffect, KeyboardEvent, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Search, User, Bot, Clock, Copy, Download, BookOpen, Brain, Award } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import NeuralOrb from "@/components/NeuralOrb";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";
import ChatSidebar from "@/components/ChatSidebar";
import { analisarComGroq, salvarNoRedis, buscarDoRedis, falarTexto } from "@/lib/aura-engine";
import { jsPDF } from "jspdf";

// Interfaces
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
  isResearch?: boolean;
  isCaseStudy?: boolean;
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

interface SearchCacheEntry {
  data: any[];
  timestamp: number;
}

// Components auxiliares
function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-sm rounded-2xl border border-blue-500/30">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-3 h-3 bg-blue-400 rounded-full"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
      <span className="text-xs text-blue-300 font-medium">Aura IA está analisando...</span>
    </div>
  );
}

function MessageActions({ 
  content, 
  sources, 
  onExport, 
  isCaseStudy 
}: { 
  content: string; 
  sources?: Message['sources'];
  onExport: () => void;
  isCaseStudy?: boolean;
}) {
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  return (
    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 absolute top-2 right-2">
      <button 
        onClick={copyToClipboard}
        className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg transition-all"
        title="Copiar"
        aria-label="Copiar mensagem"
      >
        <Copy size={14} />
      </button>
      {(sources && sources.length > 0) && (
        <button 
          onClick={onExport}
          className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg transition-all"
          title="Exportar PDF"
          aria-label="Exportar como PDF"
        >
          <Download size={14} />
        </button>
      )}
      {isCaseStudy && (
        <div className="px-2 py-1 bg-emerald-500/20 text-emerald-300 text-xs rounded-full border border-emerald-500/30 font-medium">
          Estudo de Caso
        </div>
      )}
    </div>
  );
}

export default function Index() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState("1");
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showVoiceOrb, setShowVoiceOrb] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [searchCache, setSearchCache] = useState<Record<string, SearchCacheEntry>>({});
  const [needsResearch, setNeedsResearch] = useState(false);
  const [needsCaseStudy, setNeedsCaseStudy] = useState(false);
  const [researchQuery, setResearchQuery] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  useEffect(() => {
    if (conversations.length === 0) {
      const defaultConv = { 
        id: "1", 
        title: "Nova sessão de estudo", 
        messages: [], 
        createdAt: new Date() 
      };
      setConversations([defaultConv]);
      setActiveConvId("1");
    }
  }, [conversations.length]);

  const updateResearchMode = useCallback((inputValue: string) => {
    const lowerInput = inputValue.toLowerCase().trim();
    const explicitResearch = ['pesquise', 'procure', 'busque', 'wikipedia', 'arxiv', 'artigo', 'fonte', 'cite'];
    const caseStudyTriggers = ['estudo de caso', 'caso clínico', 'análise de caso', 'paciente'];
    const implicitResearch = ['o que é', 'explique', 'definição', 'teoria'];

    const hasExplicit = explicitResearch.some(t => lowerInput.includes(t));
    const hasCase = caseStudyTriggers.some(t => lowerInput.includes(t));
    const hasImplicit = implicitResearch.some(t => lowerInput.includes(t));

    setNeedsResearch(hasExplicit || (hasImplicit && (lowerInput.includes('psico') || lowerInput.includes('comportamento'))));
    setNeedsCaseStudy(hasCase);
    setResearchQuery(lowerInput);
  }, []);

  useEffect(() => {
    updateResearchMode(input);
  }, [input, updateResearchMode]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSearchCache(prev => {
        const newCache: Record<string, SearchCacheEntry> = {};
        Object.entries(prev).forEach(([key, entry]) => {
          if (Date.now() - (entry?.timestamp || 0) <= 300000) newCache[key] = entry;
        });
        return newCache;
      });
    }, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedId = localStorage.getItem('auraai_last_id');
      if (savedId) setUserId(savedId);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (input.trim() && !userId && input.length < 20 && /^[a-zA-Z0-9_]+$/.test(input)) {
        setUserId(input.toLowerCase());
        localStorage.setItem('auraai_last_id', input.toLowerCase());
      }
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [input, userId]);

  const fetchWikipedia = useCallback(async (query: string): Promise<any[]> => {
    try {
      const cacheKey = 'wiki_' + query.toLowerCase();
      if (searchCache[cacheKey]) return searchCache[cacheKey].data;
      
      const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=" + encodeURIComponent(query) + "&srlimit=3&origin=*";
      const response = await fetch(url);
      const data: WikipediaResponse = await response.json();
      
      const results = data.query.search.map((item: any) => ({
        type: 'wikipedia' as const,
        title: item.title,
        url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(item.title.replace(/ /g, '_')),
        snippet: item.snippet.replace(/<[^>]*>/g, '').substring(0, 200) + '...'
      }));
      
      setSearchCache(prev => ({ ...prev, [cacheKey]: { data: results, timestamp: Date.now() } }));
      return results;
    } catch { return []; }
  }, [searchCache]);

  const fetchArxiv = useCallback(async (query: string): Promise<any[]> => {
    try {
      const cacheKey = 'arxiv_' + query.toLowerCase();
      if (searchCache[cacheKey]) return searchCache[cacheKey].data;
      return []; 
    } catch { return []; }
  }, [searchCache]);

  const searchSources = useCallback(async (query: string): Promise<any[]> => {
    const [wiki, arxiv] = await Promise.all([fetchWikipedia(query), fetchArxiv(query)]);
    return [...wiki, ...arxiv].slice(0, 5);
  }, [fetchWikipedia, fetchArxiv]);

  const exportarParaPDF = useCallback((texto: string, sources?: Message['sources'], isCaseStudy = false) => {
    try {
      const doc = new jsPDF();
      doc.setFillColor(59, 130, 246);
      doc.rect(0, 0, 210, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.text("AURA IA - PSICOLOGIA", 20, 22);
      doc.setFontSize(10);
      doc.text("Estudante: " + (userId || "Academico"), 20, 30);
      doc.setTextColor(40, 40, 40);
      const splitText = doc.splitTextToSize(texto.replace(/[*#]/g, ''), 180);
      doc.text(splitText, 20, 50);
      doc.save("aura_estudo_" + Date.now() + ".pdf");
    } catch (err) { console.error(err); }
  }, [userId]);

  const activeConversation = conversations.find((c) => c.id === activeConvId) || conversations[0] || { id: "1", title: "Nova", messages: [], createdAt: new Date() };
  const messages = activeConversation.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const addMessage = useCallback((role: "user" | "assistant", content: string, sources?: Message['sources'], isRes = false, isCase = false) => {
    const msg: Message = { id: Math.random().toString(), role, content, timestamp: new Date(), sources, isResearch: isRes, isCaseStudy: isCase };
    setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, messages: [...c.messages, msg], title: (c.messages.length === 0 && role === "user") ? content.slice(0, 30) : c.title } : c));
  }, [activeConvId]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isTyping) return;
    const userMsg = input.trim();
    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);

    try {
      const idParaBusca = userId || userMsg.toLowerCase().replace(/\s+/g, '_');
      const historico = await buscarDoRedis(idParaBusca).catch(() => []);
      let contexto = "AURA IA - PSICOLOGIA | Estudante: " + idParaBusca + "\nHistorico: " + historico.slice(-2).join(" | ");
      let sources: any[] = [];

      if (needsResearch) {
        addMessage("assistant", "Pesquisando fontes academicas...", [], true);
        sources = await searchSources(researchQuery);
      }

      const resposta = await analisarComGroq(userMsg, contexto);
      setConversations(prev => prev.map(c => {
        if (c.id !== activeConvId) return c;
        const clean = c.messages.filter(m => !m.content.includes("Pesquisando"));
        return { ...c, messages: [...clean, { id: Math.random().toString(), role: 'assistant', content: resposta, timestamp: new Date(), sources: sources.length > 0 ? sources : undefined, isResearch: needsResearch, isCaseStudy: needsCaseStudy }] };
      }));
      await salvarNoRedis(idParaBusca, userMsg + " | " + resposta);
      falarTexto(resposta);
    } catch {
      addMessage("assistant", "Erro na conexao.");
    } finally {
      setIsTyping(false);
      setNeedsResearch(false);
      setNeedsCaseStudy(false);
    }
  }, [input, isTyping, userId, needsResearch, needsCaseStudy, researchQuery, activeConvId, addMessage, searchSources]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
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
  }, [audioAnalyzer]);

  const createNewConversation = useCallback(() => {
    const id = Date.now().toString();
    setConversations(prev => [{ id, title: "Nova sessao", messages: [], createdAt: new Date() }, ...prev]);
    setActiveConvId(id);
  }, []);
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

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col min-w-0 relative z-10 transition-all duration-500 ${
        sidebarOpen ? "blur-md scale-[0.98] pointer-events-none lg:blur-none lg:scale-100 lg:pointer-events-auto" : ""
      }`}>
        
        {/* Header */}
        <header className="h-16 border-b border-slate-800/50 bg-slate-900/95 backdrop-blur-xl sticky top-0 z-20 flex items-center px-6 gap-4">
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="p-2 rounded-xl hover:bg-slate-800/50 transition-all lg:hidden"
            aria-label="Abrir menu lateral"
          >
            <Menu size={20} />
          </button>
          
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex h-10 w-10">
              <motion.div 
                animate={{ 
                  scale: [1, 1.05, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ 
                  duration: 3, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="relative inline-flex rounded-2xl h-10 w-10 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-2xl"
              >
                <Brain size={18} className="text-white m-auto" />
              </motion.div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black bg-gradient-to-r from-white via-indigo-200 to-purple-300 bg-clip-text text-transparent truncate">
                Aura IA
              </h1>
              <p className="text-xs text-slate-400 font-mono tracking-wider flex items-center gap-1">
                <BookOpen size={12} />
                {userId ? "Estudante: " + userId.toUpperCase() : "Digite seu nome para comecar"}
              </p>
            </div>
          </div>
          
          <button 
            onClick={createNewConversation}
            className="p-2 rounded-xl hover:bg-slate-800/50 transition-all"
            aria-label="Nova sessao de estudos"
          >
            <Plus size={20} />
          </button>
        </header>

        {/* Messages Area */}
        <main className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 px-8 py-8 space-y-6">
          {!messages.length ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-32">
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }} 
                animate={{ opacity: 1, scale: 1 }} 
                className="mb-8 w-36 h-36"
              >
                <NeuralOrb 
                  isActive={false} 
                  volume={0} 
                  frequency={0} 
                  isProcessing={false} 
                  size="xl" 
                />
              </motion.div>
              <h2 className="text-5xl font-black bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent mb-6">
                Bem-vindo a Aura IA
              </h2>
              <p className="text-xl text-slate-300 mb-8 max-w-lg mx-auto leading-relaxed">
                Seu assistente academico especializado em <strong>Psicologia</strong>. 
                Aprenda teorias, analise casos clinicos e pesquise fontes confiaveis.
              </p>
              <div className="grid md:grid-cols-3 gap-4 max-w-2xl w-full mb-12">
                <div className="bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-slate-700/50 hover:border-indigo-500/50 transition-all">
                  <BookOpen size={24} className="mx-auto mb-2 text-indigo-400" />
                  <p className="text-sm font-medium">Teorias e Conceitos</p>
                </div>
                <div className="bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-slate-700/50 hover:border-purple-500/50 transition-all">
                  <Award size={24} className="mx-auto mb-2 text-purple-400" />
                  <p className="text-sm font-medium">Estudos de Caso</p>
                </div>
                <div className="bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-slate-700/50 hover:border-emerald-500/50 transition-all">
                  <Search size={24} className="mx-auto mb-2 text-emerald-400" />
                  <p className="text-sm font-medium">Pesquisa Academica</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto w-full space-y-6">
              <AnimatePresence mode="popLayout">
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className={"flex " + (msg.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div className={"group max-w-3xl " + (msg.role === "user" ? "flex-row-reverse" : "flex")}>
                      <div className={"w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center mt-1 " + (msg.role === "user" ? "ml-4" : "mr-4")}>
                        {msg.role === "user" ? (
                          <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
                            <User size={16} className="text-white" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                            <Brain size={16} className="text-white" />
                          </div>
                        )}
                      </div>

                      <div className={"relative " + (msg.role === "user" 
                        ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white" 
                        : "bg-white/10 backdrop-blur-xl border border-slate-700/50 text-slate-100"
                      ) + " px-6 py-5 rounded-3xl shadow-2xl max-w-[90%]"}>
                        
                        <MessageActions 
                          content={msg.content} 
                          sources={msg.sources}
                          onExport={() => handleExportPDF(msg.content, msg.sources, msg.isCaseStudy)}
                          isCaseStudy={msg.isCaseStudy}
                        />
                        
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          className={"prose prose-invert max-w-none leading-relaxed text-base " + (msg.role === "user" ? "prose-indigo" : "prose-slate")}
                        >
                          {msg.content}
                        </ReactMarkdown>

                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-700/30">
                          <Clock size={14} className="text-slate-500" />
                          <span className={"text-sm " + (msg.role === "user" ? "text-indigo-200/80" : "text-slate-400")}>
                            {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              <AnimatePresence>
                {isTyping && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <div className="flex justify-start">
                      <div className="bg-white/10 backdrop-blur-xl border border-slate-700/50 px-6 py-5 rounded-3xl shadow-2xl max-w-md">
                        <TypingIndicator />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Input Area */}
        <footer className="border-t border-slate-800/50 bg-slate-900/95 backdrop-blur-2xl px-8 py-6 sticky bottom-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end gap-3 bg-slate-800/50 border border-slate-700/50 rounded-3xl p-5 hover:border-indigo-500/50 transition-all duration-300 shadow-2xl">
              
              <button 
                onClick={toggleVoice} 
                className={"p-3.5 rounded-2xl transition-all duration-300 flex-shrink-0 " + (audioAnalyzer.isActive ? "bg-red-500 text-white" : "text-slate-400 hover:bg-slate-700/50")}
              >
                {audioAnalyzer.isActive ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
              
              <textarea 
                ref={textareaRef} 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown}
                placeholder={userId ? "Pergunte sobre psicologia..." : "Digite seu nome..."} 
                rows={1}
                disabled={isTyping}
                className="flex-1 bg-transparent border-0 focus:ring-0 focus:outline-none resize-none text-base py-3.5 max-h-32"
              />
              
              <button 
                onClick={handleSend} 
                disabled={!input.trim() || isTyping}
                className={"p-3.5 rounded-2xl transition-all " + (input.trim() && !isTyping ? "bg-indigo-500 text-white" : "bg-slate-700 text-slate-500")}
              >
                {isTyping ? <Loader2 size={22} className="animate-spin" /> : <Send size={22} />}
              </button>
            </div>
            
            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-slate-500">
               <span>{needsResearch ? "Modo Pesquisa" : "Modo Aprendizado"}</span>
               <span>Aura IA 2.0 | USP, AVASUS, UFRGS, CBI</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Voice Orb Overlay */}
      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-8"
          >
            <div className="text-center mb-12">
              <div className="w-48 h-48 mx-auto mb-8">
                <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={audioAnalyzer.isProcessing} size="2xl" />
              </div>
              <h3 className="text-3xl font-black text-white mb-3">Modo Voz Ativo</h3>
            </div>
            <button onClick={toggleVoice} className="p-8 bg-red-500 text-white rounded-3xl font-bold text-xl flex items-center gap-3">
              <MicOff size={32} />
              <span>Parar Gravacao</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
