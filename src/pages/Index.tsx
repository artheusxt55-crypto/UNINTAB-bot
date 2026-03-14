
import { useState, useRef, useEffect, KeyboardEvent, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, Search, BookOpen, Globe, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import NeuralOrb from "@/components/NeuralOrb";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";
import ChatSidebar from "@/components/ChatSidebar";
import { jsPDF } from "jspdf";

// Interfaces
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: string[];
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

// Tipos para APIs
interface WikipediaResult {
  title: string;
  extract: string;
  pageid: number;
  url: string;
}

interface ScieloResult {
  title: string;
  abstract: string;
  authors: string[];
  doi: string;
  url: string;
}

interface ArxivResult {
  title: string;
  summary: string;
  authors: string[];
  pdf_url: string;
}

// Estados globais
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

// APIs Integradas
const searchWikipedia = async (query: string): Promise<WikipediaResult[]> => {
  try {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    const data = await response.json();
    return [{
      title: data.title,
      extract: data.extract,
      pageid: data.pageid,
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`
    }];
  } catch {
    return [];
  }
};

const searchScielo = async (query: string): Promise<ScieloResult[]> => {
  try {
    const response = await fetch(`https://search.scielo.org/api_search/?q=${encodeURIComponent(query)}&lang=pt&count=3&from=0&output=site&sort=&format=summary`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.result || [];
  } catch {
    return [];
  }
};

const searchArxiv = async (query: string): Promise<ArxivResult[]> => {
  try {
    const response = await fetch(`http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=3&sortBy=submittedDate&sortOrder=descending`);
    if (!response.ok) return [];
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const entries = xml.querySelectorAll('entry');
    return Array.from(entries).map(entry => ({
      title: entry.querySelector('title')?.textContent || '',
      summary: entry.querySelector('summary')?.textContent || '',
      authors: Array.from(entry.querySelectorAll('author name')).map(a => a.textContent || ''),
      pdf_url: entry.querySelector('link[title="pdf"]')?.getAttribute('href') || ''
    })).filter(e => e.title);
  } catch {
    return [];
  }
};

const searchPubMed = async (query: string): Promise<any[]> => {
  try {
    const response = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=3&retmode=json`);
    const data = await response.json();
    if (!data.esearchresult.idlist.length) return [];
    
    const ids = data.esearchresult.idlist.join(',');
    const summaryResponse = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids}&retmode=json`);
    const summaryData = await summaryResponse.json();
    
    return Object.values(summaryData.result || {}).filter((item: any) => item.title);
  } catch {
    return [];
  }
};

// Componente Principal
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
  const [searchingSources, setSearchingSources] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  // Persistência de User ID
  useEffect(() => {
    const savedId = localStorage.getItem('untbot_last_id');
    if (savedId) setUserId(savedId);
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, activeConvId, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Gerar PDF melhorado
  const exportarParaPDF = useCallback((texto: string, sources: string[] = []) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(227, 6, 19);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("🧠 UNINTA - RELATÓRIO DE SINAPSE NEURAL", 20, 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`ID: ${userId.toUpperCase()} | ${new Date().toLocaleString('pt-BR')}`, 20, 28);
    
    // Conteúdo
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    
    let yPosition = 45;
    const splitText = doc.splitTextToSize(texto.replace(/[*#]/g, '').replace(/\n/g, ' '), 180);
    
    for (const line of splitText) {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
      doc.text(line, 20, yPosition);
      yPosition += 6;
    }
    
    // Fontes
    if (sources.length > 0) {
      yPosition += 10;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text("📚 FONTES CONSULTADAS:", 20, yPosition);
      yPosition += 8;
      
      sources.slice(0, 5).forEach((source, i) => {
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
        const shortSource = source.length > 100 ? source.substring(0, 100) + '...' : source;
        doc.text(`• ${shortSource}`, 25, yPosition);
        yPosition += 6;
      });
    }
    
    doc.save(`sinapse_neural_${userId || 'lab'}_${Date.now()}.pdf`);
  }, [userId]);

  const activeConversation = conversations.find((c) => c.id === activeConvId) || conversations[0];
  const messages = activeConversation.messages;

  // Adicionar mensagem com animações
  const addMessage = (role: "user" | "assistant", content: string, sources: string[] = []) => {
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

  // Busca inteligente em múltiplas fontes
  const buscarFontesRelevantes = useCallback(async (query: string): Promise<string[]> => {
    setSearchingSources(true);
    try {
      const [wiki, scielo, arxiv, pubmed] = await Promise.all([
        searchWikipedia(query),
        searchScielo(query),
        searchArxiv(query),
        searchPubMed(query)
      ]);

      const sources: string[] = [];
      
      wiki.forEach(w => sources.push(`📖 Wikipedia: ${w.title} - ${w.url}`));
      scielo.slice(0, 2).forEach(s => sources.push(`🔬 SciELO: ${s.title} - ${s.url}`));
      arxiv.slice(0, 2).forEach(a => sources.push(`📄 arXiv: ${a.title} - ${a.pdf_url}`));
      
      return sources.slice(0, 8);
    } catch {
      return [];
    } finally {
      setSearchingSources(false);
    }
  }, []);

  // Função principal de envio
  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const userMsg = input.trim();

    // Identificação do usuário
    if (!userId) {
      setUserId(userMsg.toLowerCase());
      localStorage.setItem('untbot_last_id', userMsg.toLowerCase());
      addMessage("user", userMsg);
      addMessage("assistant", `🔐 ID ${userId.toUpperCase()} registrado. Sinapse neural ativa. Como posso ajudar no Lab Neuro-UNINTA?`);
      setInput("");
      return;
    }

    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);

    try {
      // Buscar fontes relevantes
      const sources = await buscarFontesRelevantes(userMsg);
      
      // Contexto expandido com fontes
      const contexto = `Você é Aura AI do Lab Neuro-UNINTA. Mestre: Matheus. Operador: ${userId}. 
      
      FONTES RELEVANTES ENCONTRADAS:
      ${sources.map(s => `• ${s}`).join('\n')}
      
      Forneça resposta precisa, científica e útil baseada nas fontes acima. Cite-as quando relevante.`;

      // Integração com Groq (mantendo compatibilidade)
      const resposta = await analisarComGroq(userMsg, contexto);
      
      // Salvar no Redis
      await salvarNoRedis(userId, `U: ${userMsg} | B: ${resposta} | S: ${sources.join(' | ')}`);
      
      addMessage("assistant", resposta, sources);
      falarTexto(resposta);
    } catch (error) {
      console.error("Erro na sinapse:", error);
      addMessage("assistant", "⚠️ Erro de conexão neural. Verifique sua conexão e tente novamente.", []);
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

  // Renderização das fontes
  const renderSources = (sources: string[]) => (
    sources.length > 0 && (
      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs mb-2 text-primary/80">
          <Search size={12} />
          <span>Fontes consultadas:</span>
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {sources.map((source, i) => (
            <a 
              key={i}
              href={source.split(' - ')[1] || '#'} 
              target="_blank" 
              rel="noopener noreferrer"
              className="block text-xs bg-white/5 hover:bg-primary/20 p-2 rounded border border-white/10 truncate hover:no-underline transition-all"
            >
              {source}
            </a>
          ))}
        </div>
      </div>
    )
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-black via-gray-900 to-black overflow-hidden font-sans relative selection:bg-primary/30">
      {/* Background Neural */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-[120px] animate-pulse delay-1000" />
        <div className="absolute top-1/4 right-1/4 w-[20%] h-[20%] bg-emerald-500/3 rounded-full blur-[60px] animate-pulse delay-500" />
      </div>

      {/* Sidebar */}
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

      {/* Mobile Overlay */}
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

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-w-0 relative z-10 transition-all duration-500 ${
        sidebarOpen ? "blur-md scale-[0.98] pointer-events-none lg:blur-none lg:scale-100 lg:pointer-events-auto" : ""
      }`}>
        
        {/* Header */}
        <header className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-black/40 backdrop-blur-xl shadow-2xl">
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="p-2 rounded-lg hover:bg-white/10 transition-all text-muted-foreground group"
          >
            <Menu size={20} className="group-hover:rotate-90 transition-transform" />
          </button>
          
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex h-3 w-3 relative">
              <motion.span 
                className="absolute inset-0 rounded-full bg-primary opacity-75"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary shadow-[0_0_12px_rgba(var(--primary),0.8)]" />
            </div>
            <h1 className="text-sm font-bold font-mono tracking-[0.3em] text-primary uppercase bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent drop-shadow-lg">
              UNINTA // {userId ? userId.toUpperCase() : "AGUARDANDO_ID"}
            </h1>
          </div>
          
          <button 
            onClick={() => {
              const id = Date.now().toString();
              setConversations(prev => [{ id, title: "Nova conversa", messages: [], createdAt: new Date() }, ...prev]);
              setActiveConvId(id);
            }} 
            className="p-2 rounded-lg hover:bg-white/10 transition-all text-muted-foreground"
            title="Nova conversa"
          >
            <Plus size={20} />
          </button>
        </header>

        {/* Messages Area */}
        <main className="flex-1 overflow-y-auto chat-scrollbar relative scroll-smooth px-6 py-8 bg-gradient-to-b from-transparent/50 to-black/30">
          {!messages.length ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }} 
                animate={{ opacity: 1, scale: 1 }} 
                className="mb-12 drop-shadow-2xl"
              >
                <NeuralOrb 
                  isActive={audioAnalyzer.isActive} 
                  volume={audioAnalyzer.volume} 
                  frequency={audioAnalyzer.frequency} 
                  isProcessing={audioAnalyzer.isProcessing} 
                               size="lg" 
              />
              </motion.div>
              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-bold tracking-tight text-white/95 mb-4 bg-gradient-to-r from-white to-primary/50 bg-clip-text"
              >
                Sinapse Neural Ativa
              </motion.h2>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-xs font-mono uppercase tracking-[0.5em] text-muted-foreground/50 mb-8"
              >
                Lab Neuro-UNINTA // Aura AI Online
              </motion.p>
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex gap-2 text-sm text-muted-foreground/70 max-w-md mx-auto"
              >
                <span className="flex items-center gap-1">
                  <Globe size={14} />
                  Wikipedia • SciELO • arXiv • PubMed
                </span>
              </motion.div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto w-full space-y-8">
              <AnimatePresence mode="popLayout">
                {messages.map((msg, index) => (
                  <motion.div 
                    key={msg.id} 
                    initial={{ opacity: 0, y: 20, scale: 0.95 }} 
                    animate={{ opacity: 1, y: 0, scale: 1 }} 
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center border-2 border-primary/30 shrink-0 shadow-[0_0_20px_rgba(var(--primary),0.2)] backdrop-blur-sm">
                        <Zap size={16} className="text-primary drop-shadow-lg animate-pulse" />
                      </div>
                    )}
                    
                    <div className={`group relative max-w-[90%] lg:max-w-[75%] ${msg.role === "user" 
                      ? "bg-gradient-to-r from-primary/95 to-primary/80 text-primary-foreground border-primary/30 shadow-primary/25" 
                      : "bg-white/8 border-white/15 backdrop-blur-xl shadow-2xl hover:shadow-white/20"
                    } p-6 rounded-3xl border shadow-2xl transition-all hover:shadow-xl`}>
                      
                      <ReactMarkdown 
                        className="prose prose-invert prose-sm max-w-none leading-relaxed break-words"
                        components={{
                          a: ({ node, ...props }) => (
                            <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium" />
                          )
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                      
                      {/* Botões de ação */}
                      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
                        {msg.role === 'assistant' && (
                          <>
                            <motion.button 
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => exportarParaPDF(msg.content, msg.sources || [])}
                              className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-primary/20 text-white border border-white/20 px-3 py-1.5 rounded-xl font-mono uppercase tracking-wide transition-all group"
                              title="Exportar Relatório PDF"
                            >
                              <FileText size={12} />
                              <span>PDF</span>
                            </motion.button>
                            
                            {msg.sources && msg.sources.length > 0 && (
                              <motion.button 
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                  const sourcesText = msg.sources!.join('\n');
                                  navigator.clipboard.writeText(sourcesText);
                                }}
                                className="flex items-center gap-1 text-xs bg-white/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-xl font-mono uppercase tracking-wide transition-all"
                                title="Copiar fontes"
                              >
                                📚 {msg.sources.length}
                              </motion.button>
                            )}
                          </>
                        )}
                        
                        {msg.role === 'user' && (
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              // Editar mensagem (futuro)
                            }}
                            className="text-xs opacity-0 group-hover:opacity-100 transition-all text-muted-foreground hover:text-white"
                          >
                            editar
                          </motion.button>
                        )}
                      </div>
                      
                      {/* Fontes */}
                      {renderSources(msg.sources || [])}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isTyping && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex gap-4 items-start"
                >
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center border-2 border-primary/30 shadow-[0_0_20px_rgba(var(--primary),0.2)] backdrop-blur-sm mt-1">
                    {searchingSources ? (
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-100" />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce delay-200" />
                      </div>
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-primary animate-ping" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-3 rounded-2xl backdrop-blur-xl">
                    <TypingIndicator />
                    <span className="text-xs text-muted-foreground/70 font-mono tracking-wide">
                      {searchingSources ? "🔍 Pesquisando fontes científicas..." : "Processando sinapse neural..."}
                    </span>
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Input Area */}
        <footer className="px-6 pb-8 pt-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent/0 backdrop-blur-3xl border-t border-white/5 sticky bottom-0">
          <div className="max-w-4xl mx-auto relative">
            <div className="relative group">
              <div className="flex items-end gap-3 bg-black/70 border border-white/15 rounded-3xl p-4 transition-all duration-300 backdrop-blur-[60px] shadow-2xl hover:shadow-[0_20px_40px_rgba(0,0,0,0.6)] hover:border-white/25">
                
                {/* Voice Button */}
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleVoice}
                  className={`p-3.5 rounded-2xl transition-all flex-shrink-0 ${
                    audioAnalyzer.isActive 
                      ? "bg-gradient-to-r from-destructive to-red-600/80 text-white shadow-[0_0_25px_rgba(var(--destructive),0.4)] border-destructive/30" 
                      : "text-muted-foreground/70 hover:bg-white/10 hover:text-white border-white/10"
                  }`}
                  title="Modo Voz"
                >
                  {audioAnalyzer.isActive ? <MicOff size={20} /> : <Mic size={20} />}
                </motion.button>
                
                {/* Text Input */}
                <textarea 
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={userId ? "💭 Injete um comando neural ou pergunta científica..." : "👤 Digite seu ID para ativar a sinapse..."}
                  rows={1}
                  autoComplete="off"
                  spellCheck="false"
                  disabled={isTyping}
                  maxLength={2000}
                  className="flex-1 bg-transparent border-0 focus:border-0 focus:ring-0 focus:outline-none resize-none text-base py-3.5 pr-3 placeholder:text-muted-foreground/40 font-sans min-h-[44px] max-h-32 overflow-y-auto text-white selection:bg-primary/40 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
                  style={{ 
                    border: 'none', 
                    boxShadow: 'none', 
                    outline: 'none', 
                    background: 'transparent' 
                  }}
                />
                
                {/* Send Button */}
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className={`p-3.5 rounded-2xl shadow-lg active:scale-95 transition-all flex-shrink-0 group ${
                    !input.trim() || isTyping
                      ? "opacity-30 cursor-not-allowed bg-primary/50 border-primary/30"
                      : "bg-gradient-to-r from-primary to-purple-600 hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] border-primary/40 shadow-primary/25"
                  } text-primary-foreground border`}
                  title="Enviar"
                >
                  {isTyping ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Send size={20} className="group-hover:translate-x-1 transition-transform duration-200" />
                  )}
                </motion.button>
              </div>
              
              {/* Char counter */}
              {input.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute -bottom-8 right-0 text-xs text-muted-foreground/50 font-mono tracking-wider"
                >
                  {input.length}/2000
                </motion.div>
              )}
            </div>
            
            {/* Footer text */}
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-[11px] text-muted-foreground/30 mt-6 font-mono uppercase tracking-[0.6em] animate-pulse"
            >
              Neural Lab UNINTA // Protocolo 7.1 • Multi-Source AI
            </motion.p>
          </div>
        </footer>
      </div>

      {/* Voice Orb Overlay */}
      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-[100] bg-gradient-to-br from-black/98 via-black/95 to-transparent backdrop-blur-3xl flex flex-col items-center justify-center p-8"
          >
            <motion.div 
              animate={{ 
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0]
              }}
              transition={{ 
                duration: 3, 
                repeat: Infinity,
                scale: { duration: 2 },
                rotate: { duration: 4 }
              }}
            >
              <NeuralOrb 
                isActive={audioAnalyzer.isActive} 
                volume={audioAnalyzer.volume} 
                frequency={audioAnalyzer.frequency} 
                isProcessing={audioAnalyzer.isProcessing} 
                size="xl" 
              />
            </motion.div>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-lg font-bold text-white/90 mt-12 mb-8 tracking-wide"
            >
              🎤 Modo Voz Ativo
            </motion.p>
            
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleVoice}
              className="p-6 rounded-3xl bg-gradient-to-r from-destructive/20 to-red-600/30 text-destructive border-2 border-destructive/40 hover:from-destructive/30 hover:to-red-600/50 hover:text-white hover:border-destructive/60 backdrop-blur-xl shadow-2xl shadow-destructive/20 hover:shadow-destructive/40 transition-all font-mono uppercase tracking-wider text-lg font-bold"
            >
              <MicOff size={28} className="inline mr-2" />
              Parar Gravação
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Mock functions para compatibilidade (substitua pelas reais)
const analisarComGroq = async (mensagem: string, contexto: string): Promise<string> => {
  // Simulação de delay de API
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return `🔬 **Resposta Neural Gerada:**

${mensagem.endsWith('?') ? 'Baseado nas fontes consultadas:' : ''}

- Análise precisa da sua consulta
- Integração com Wikipedia, SciELO, arXiv e PubMed
- Resposta contextualizada e científica

**Contexto do Lab Neuro-UNINTA:** Operador ${contexto.match(/Operador: ([^\.]+)/)?.[1] || 'desconhecido'} registrado.

⚡ Sinapse processada com sucesso.`;
};

const salvarNoRedis = async (id: string, dados: string): Promise<void> => {
  // Mock Redis save
  console.log('💾 Salvando no Redis:', id, dados.slice(0, 100) + '...');
};

const buscarDoRedis = async (id: string): Promise<string[]> => {
  // Mock Redis fetch
  return ['Histórico anterior simulado'];
};

const falarTexto = async (texto: string): Promise<void> => {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.rate = 0.9;
    utterance.pitch = 1.1;
    speechSynthesis.speak(utterance);
  }
};
                  
