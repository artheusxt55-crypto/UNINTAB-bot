Aqui está o código completamente melhorado com layout estilo ChatGPT, integração robusta de APIs, IA inteligente que diferencia conversa de pesquisa, e design ultra-profissional:

```tsx
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, Search, BookOpen, Globe, User, Bot, Clock, Copy, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  isResearch?: boolean;
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
    <div className="flex items-center gap-2 px-4 py-3 bg-gray-100/10 backdrop-blur-sm rounded-2xl border border-gray-200/20">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-3 h-3 bg-gray-400 rounded-full"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
      <span className="text-xs text-gray-500 font-medium">Psico AI está pensando...</span>
    </div>
  );
}

function MessageActions({ content, sources }: { content: string; sources?: Message['sources'] }) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
  };

  return (
    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 absolute top-2 right-2">
      <button 
        onClick={copyToClipboard}
        className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg transition-all"
        title="Copiar"
      >
        <Copy size={14} />
      </button>
      {sources && sources.length > 0 && (
        <button 
          onClick={() => {
            // Lógica para exportar PDF
          }}
          className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg transition-all"
          title="Exportar PDF"
        >
          <Download size={14} />
        </button>
      )}
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
  const [needsResearch, setNeedsResearch] = useState(false);
  const [researchQuery, setResearchQuery] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  // ✅ IA INTELIGENTE: Detecta quando precisa pesquisar vs conversa normal
  useEffect(() => {
    const lowerInput = input.toLowerCase().trim();
    
    // Triggers de pesquisa explícitos (alta prioridade)
    const explicitResearch = [
      'pesquise', 'procure', 'busque', 'pesquisa sobre', 'encontre',
      'wikipedia', 'wiki', 'arxiv', 'artigo científico', 'estudo sobre',
      'fonte', 'referência', 'cite', 'embasamento', 'definição de'
    ];
    
    // Triggers implícitos (baixa prioridade - só se contexto indicar)
    const implicitResearch = [
      'o que é', 'explique', 'definição', 'história de', 'quem é'
    ];

    const hasExplicit = explicitResearch.some(trigger => 
      lowerInput.includes(trigger) || lowerInput.startsWith(trigger)
    );
    
    const hasImplicit = implicitResearch.some(trigger => lowerInput.includes(trigger));

    // Só ativa pesquisa se for explícito OU implícito + contexto acadêmico
    setNeedsResearch(hasExplicit || (hasImplicit && lowerInput.includes('psicologia') || lowerInput.includes('psico')));
    setResearchQuery(lowerInput);
  }, [input]);

  // Cache cleanup
  useEffect(() => {
    const interval = setInterval(() => {
      setSearchCache(new Map());
    }, 600000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const savedId = localStorage.getItem('psicoai_last_id');
    if (savedId) setUserId(savedId);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (input.trim() && !userId && input.toLowerCase().match(/^[a-zA-Z0-9_]+$/)) {
        setUserId(input.toLowerCase());
        localStorage.setItem('psicoai_last_id', input.toLowerCase());
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [input, userId]);

  // ✅ WIKIPEDIA API MELHORADA
  const fetchWikipedia = async (query: string): Promise<any[]> => {
    try {
      const cached = searchCache.get(`wiki_${query}`);
      if (cached) return cached;
      
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&srprop=snippet&origin=*`
      );
      const data: WikipediaResponse = await response.json();
      
      const results = data.query.search.slice(0, 3).map((item: any) => ({
        type: 'wikipedia' as const,
        title: item.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
        snippet: item.snippet.replace(/<[^>]*>/g, '').substring(0, 200) + '...'
      }));
      
      setSearchCache(prev => new Map(prev).set(`wiki_${query}`, results));
      return results;
    } catch (error) {
      console.error('Wikipedia API error:', error);
      return [];
    }
  };

  // ✅ ARXIV API MELHORADA
  const fetchArxiv = async (query: string): Promise<any[]> => {
    try {
      const cached = searchCache.get(`arxiv_${query}`);
      if (cached) return cached;
      
      const response = await fetch(
        `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=5&sortBy=relevance&sortOrder=descending`
      );
      const data: ArxivResponse = await response.json();
      
      const results = data.feed.entry.slice(0, 3).map((entry: any) => {
        const pdfLink = entry.link.find((link: any) => link.title === 'pdf');
        const absLink = entry.link.find((link: any) => link.title === 'abs');
        return {
          type: 'scientific' as const,
          title: entry.title[0].toUpperCase() + entry.title.slice(1),
          url: pdfLink?.href || absLink?.href || entry.link[0].href,
          snippet: entry.summary.replace(/<[^>]*>/g, '').substring(0, 200) + '...'
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
    return [...wikiResults, ...arxivResults].slice(0, 5);
  };

  // ✅ PDF PROFISSIONAL
  const exportarParaPDF = (texto: string, sources?: Message['sources']) => {
    const doc = new jsPDF();
    
    // Header profissional
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("🧠 PSICO AI - RELATÓRIO PSICOLÓGICO", 20, 20);
    
    doc.setFontSize(10);
    doc.text(`ID Paciente: ${userId.toUpperCase()} | ${new Date().toLocaleString('pt-BR')}`, 20, 27);

    // Conteúdo
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    
    let yPosition = 45;
    const cleanText = texto.replace(/[*#]/g, '').replace(/\n\n/g, '\n');
    const splitText = doc.splitTextToSize(cleanText, 180);
    doc.text(splitText, 20, yPosition);
    yPosition += splitText.length * 6 + 20;

    // Referências
    if (sources && sources.length > 0) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(70, 70, 70);
      doc.text("📚 REFERÊNCIAS CIENTÍFICAS", 20, yPosition);
      yPosition += 15;

      sources.forEach((source, idx) => {
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
        
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        const icon = source.type === 'wikipedia' ? '🌐' : '🔬';
        doc.text(`${idx + 1}. ${icon} ${source.title.substring(0, 70)}${source.title.length > 70 ? '...' : ''}`, 25, yPosition);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const shortUrl = source.url.replace('https://', '').substring(0, 80);
        doc.text(shortUrl, 25, yPosition + 5);
        yPosition += 12;
      });
    }
    
    doc.save(`psico_ai_relatorio_${userId || 'consulta'}_${Date.now()}.pdf`);
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

  const addMessage = (role: "user" | "assistant", content: string, sources?: Message['sources'], isResearch = false) => {
    const msg: Message = { 
      id: Date.now().toString() + Math.random(), 
      role, 
      content, 
      timestamp: new Date(),
      sources,
      isResearch
    };
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConvId) return c;
        const updated = { ...c, messages: [...c.messages, msg] };
        if (role === "user" && c.messages.length === 0) {
          updated.title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
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
      const idParaBusca = userId || userMsg.toLowerCase();
      const historico = await buscarDoRedis(idParaBusca);
      
      let contexto = `🧠 PSICO AI - PSICÓLOGO PROFISSIONAL | ID: ${idParaBusca}

🛡️ REGRAS INTELIGENTES:
1. 90% conversa natural/humanizada como psicólogo experiente
2. 10% pesquisa acadêmica APENAS quando necessário
3. NUNCA cite fontes automaticamente na resposta
4. Seja empático, acolhedor e profissional
5. Use linguagem acessível e terapêutica

📜 Histórico recente: ${historico.slice(-4).join(" | ")}

💭 Pergunta do paciente: ${userMsg}`;

      let sources: any[] = [];

      // ✅ PESQUISA INTELIGENTE
      if (needsResearch) {
        const researchMsg = `🔍 Pesquisando fontes confiáveis (Wikipedia + ArXiv)...`;
        addMessage("assistant", researchMsg, [], true);
        
        sources = await searchSources(researchQuery);
        const fonteTexto = sources.length > 0
          ? `\n\n📚 FONTES ENCONTRADAS (${sources.length}):\n${sources.map(s => `• ${s.title.substring(0, 60)}... (${s.type})`).join('\n')}`
          : '\n\n⚠️ Nenhuma fonte acadêmica encontrada para este tópico';
        
        contexto += fonteTexto;
      }

      const resposta = await analisarComGroq(userMsg, contexto);
      
      // Remove mensagem de loading
      setConversations(prev => 
        prev.map(c => {
          if (c.id !== activeConvId) return c;
          const cleanMessages = c.messages.filter(m => 
            !m.content.includes('Pesquisando') && !m.content.includes('pesquisando')
          );
          return {
            ...c,
            messages: [...cleanMessages, {
              id: Date.now().toString(),
              role: 'assistant' as const,
              content: resposta,
              timestamp: new Date(),
              sources: sources.length > 0 ? sources : undefined,
              isResearch: needsResearch
            }]
          };
        })
      );
      
      await salvarNoRedis(idParaBusca, `U: ${userMsg} | A: ${resposta} | S: ${JSON.stringify(sources)} | R: ${needsResearch}`);
      falarTexto(resposta);
    } catch (error) {
      console.error('Erro na comunicação:', error);
      addMessage("assistant", "⚠️ Desculpe, houve um problema na conexão neural. Verifique sua internet e tente novamente.\n\n💡 Dica: Perguntas mais específicas funcionam melhor!", [], false);
    } finally {
      setIsTyping(false);
      setNeedsResearch(false);
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
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white overflow-hidden">
      {/* Sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeConvId={activeConvId}
        onSelect={(id) => { setActiveConvId(id); setSidebarOpen(false); }}
        onNew={() => {
          const id = Date.now().toString();
          setConversations(prev => [{ id, title: "Nova sessão terapêutica", messages: [], createdAt: new Date() }, ...prev]);
          setActiveConvId(id);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Mobile overlay */}
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

      {/* Main Chat Area - ESTILO CHATGPT */}
      <div className={`flex-1 flex flex-col min-w-0 relative z-10 transition-all duration-500 ${sidebarOpen ? "blur-md scale-[0.98] pointer-events-none lg:blur-none lg:scale-100 lg:pointer-events-auto" : ""}`}>
        
        {/* Header moderno */}
        <header className="h-16 border-b border-slate-800/50 bg-slate-900/95 backdrop-blur-xl sticky top-0 z-20 flex items-center px-6 gap-4">
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="p-2 rounded-xl hover:bg
                      hover:bg-slate-800/50 transition-all lg:hidden"
          >
            <Menu size={20} />
          </button>
          
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex h-8 w-8">
              <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></div>
              <div className="relative inline-flex rounded-full h-8 w-8 bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg"></div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent truncate">
                Psico AI
              </h1>
              <p className="text-xs text-slate-400 font-mono tracking-wider">
                {userId ? `Sessão: ${userId.toUpperCase()}` : "Digite seu nome para começar"}
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => {
              const id = Date.now().toString();
              setConversations(prev => [{ id, title: "Nova sessão terapêutica", messages: [], createdAt: new Date() }, ...prev]);
              setActiveConvId(id);
            }} 
            className="p-2 rounded-xl hover:bg-slate-800/50 transition-all"
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
                className="mb-8 w-32 h-32"
              >
                <NeuralOrb 
                  isActive={false} 
                  volume={0} 
                  frequency={0} 
                  isProcessing={false} 
                  size="lg" 
                />
              </motion.div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent mb-4">
                Bem-vindo ao Psico AI
              </h2>
              <p className="text-xl text-slate-400 mb-8 max-w-md mx-auto leading-relaxed">
                Seu psicólogo virtual 24/7. Conversa natural ou pesquisa acadêmica com 
                <span className="font-semibold text-blue-400"> Wikipedia + ArXiv</span>.
              </p>
              <p className="text-sm text-slate-500 font-mono uppercase tracking-wider mb-12">
                "pesquise [tema]" para fontes científicas | Conversa normal para terapia
              </p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto w-full space-y-6">
              <AnimatePresence mode="popLayout">
                {messages.map((msg, index) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`group max-w-3xl ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center mt-1 ${msg.role === "user" ? "order-2" : "order-1"}`}>
                        {msg.role === "user" ? (
                          <User size={20} className="text-blue-400" />
                        ) : (
                          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                            <Bot size={14} className="text-white" />
                          </div>
                        )}
                      </div>

                      {/* Message Bubble */}
                      <div className={`relative ${msg.role === "user" 
                        ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white ml-4" 
                        : "bg-white/10 backdrop-blur-xl border border-slate-700/50 text-slate-100 mr-4"
                      } px-6 py-4 rounded-3xl shadow-xl max-w-[90%] hover:shadow-2xl transition-all duration-300`}>
                        
                        {/* Actions */}
                        <MessageActions content={msg.content} sources={msg.sources} />
                        
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          className={`prose prose-invert max-w-none leading-relaxed text-sm ${msg.role === "user" ? "prose-blue" : "prose-slate"}`}
                        >
                          {msg.content}
                        </ReactMarkdown>

                        {/* Timestamp */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/30">
                          <Clock size={12} className="text-slate-500" />
                          <span className={`text-xs ${msg.role === "user" ? "text-blue-200/80" : "text-slate-500"}`}>
                            {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          
                          {msg.isResearch && (
                            <span className="ml-auto px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30">
                              🔬 Pesquisa
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Typing Indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-white/10 backdrop-blur-xl border border-slate-700/50 px-6 py-4 rounded-3xl shadow-xl max-w-md">
                    <TypingIndicator />
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Input Area - ChatGPT Style */}
        <footer className="border-t border-slate-800/50 bg-slate-900/95 backdrop-blur-2xl px-8 py-6 sticky bottom-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end gap-3 bg-slate-800/50 border border-slate-700/50 rounded-3xl p-4 hover:border-slate-600/50 transition-all duration-300 shadow-2xl hover:shadow-3xl">
              
              {/* Voice Button */}
              <button 
                onClick={toggleVoice} 
                className={`p-3 rounded-2xl transition-all duration-300 flex-shrink-0 ${
                  audioAnalyzer.isActive 
                    ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25" 
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                }`}
              >
                {audioAnalyzer.isActive ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              
              {/* Text Input */}
              <textarea 
                ref={textareaRef} 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown}
                placeholder={userId ? "Desabafe ou pesquise algo específico..." : "Digite seu nome para iniciar a sessão..."} 
                rows={1}
                disabled={isTyping}
                className="flex-1 bg-transparent border-0 focus:border-0 focus:ring-0 focus:outline-none resize-none text-base placeholder:text-slate-500 font-normal py-3 max-h-32 scrollbar-thin scrollbar-thumb-slate-600"
              />
              
              {/* Send Button */}
              <button 
                onClick={handleSend} 
                disabled={!input.trim() || isTyping}
                className={`p-3 rounded-2xl transition-all duration-300 flex-shrink-0 group ${
                  input.trim() && !isTyping
                    ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 active:scale-95"
                    : "bg-slate-700/50 text-slate-500 cursor-not-allowed"
                }`}
              >
                {isTyping ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} className="group-hover:translate-x-1 transition-transform duration-200" />
                )}
              </button>
            </div>
            
            {/* Status Bar */}
            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Search size={12} />
                {needsResearch ? "🔍 Modo pesquisa ativo" : "💭 Modo conversa"}
              </span>
              <span>Neural Engine 2.0 | ArXiv + Wikipedia</span>
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
            className="fixed inset-0 z-[100] bg-gradient-to-br from-black/95 to-slate-900/95 backdrop-blur-3xl flex flex-col items-center justify-center p-8"
          >
            <div className="text-center mb-12">
              <div className="w-40 h-40 mx-auto mb-6">
                <NeuralOrb 
                  isActive={audioAnalyzer.isActive} 
                  volume={audioAnalyzer.volume} 
                  frequency={audioAnalyzer.frequency} 
                  isProcessing={audioAnalyzer.isProcessing} 
                  size="xl" 
                />
              </div>
              <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                🎤 Modo Voz Ativo
              </h3>
              <p className="text-slate-400">Fale naturalmente com o Psico AI</p>
            </div>
            
            <button 
              onClick={toggleVoice}
              className="p-6 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-3xl shadow-2xl shadow-red-500/50 hover:shadow-3xl hover:shadow-red-500/60 hover:scale-105 active:scale-95 transition-all duration-300 font-semibold text-lg"
            >
              <MicOff size={28} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
