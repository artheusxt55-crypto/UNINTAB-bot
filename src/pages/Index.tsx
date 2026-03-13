import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, BookOpen, Link, Brain, Search, MessageCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import NeuralOrb from "@/components/NeuralOrb";
import { useAudioAnalyzer } from "@/hooks/useAudioAnalyzer";
import ChatSidebar from "@/components/ChatSidebar";
import { analisarComGroq, salvarNoRedis, buscarDoRedis, falarTexto } from "@/lib/aura-engine";
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: Source[];
  type?: 'chat' | 'research' | 'wiki' | 'scientific';
}

interface Source {
  title: string;
  url: string;
  type: 'wikipedia' | 'arxiv' | 'pubmed' | 'scholar';
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

// APIs Integradas
const searchWikipedia = async (query: string): Promise<Source[]> => {
  try {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
    if (response.ok) {
      const data = await response.json();
      return [{
        title: data.title,
        url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        type: 'wikipedia'
      }];
    }
  } catch (error) {
    console.error('Wikipedia API error:', error);
  }
  return [];
};

const searchArxiv = async (query: string): Promise<Source[]> => {
  try {
    const response = await fetch(`http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=3&sortBy=relevance&sortOrder=descending`);
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const entries = xml.querySelectorAll('entry');
    return Array.from(entries).map(entry => ({
      title: entry.querySelector('title')?.textContent || '',
      url: entry.querySelector('id')?.textContent || '',
      type: 'arxiv'
    })).filter(s => s.title);
  } catch (error) {
    console.error('Arxiv API error:', error);
  }
  return [];
};

const searchSemanticScholar = async (query: string): Promise<Source[]> => {
  try {
    const response = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=3&fields=title,url,year`);
    const data = await response.json();
    return data.data.map((paper: any) => ({
      title: paper.title,
      url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
      type: 'scholar'
    }));
  } catch (error) {
    console.error('Semantic Scholar API error:', error);
  }
  return [];
};

const detectarIntencao = (mensagem: string): 'chat' | 'research' => {
  const pesquisaKeywords = [
    'pesquise', 'procure', 'encontre', 'o que é', 'defina', 'explique', 'estude', 'artigo', 'paper',
    'wikipedia', 'wiki', 'científico', 'estudo', 'pesquisa', 'referência', 'fonte'
  ];
  
  const textoLower = mensagem.toLowerCase();
  const temPalavraChave = pesquisaKeywords.some(keyword => textoLower.includes(keyword));
  
  return temPalavraChave ? 'research' : 'chat';
};

const pesquisarInformacao = async (query: string): Promise<{ content: string; sources: Source[] }> => {
  const sources: Source[] = [];
  
  // Wikipedia
  const wikiSources = await searchWikipedia(query);
  sources.push(...wikiSources);
  
  // Arxiv para papers científicos
  if (query.toLowerCase().includes('estudo') || query.toLowerCase().includes('paper')) {
    const arxivSources = await searchArxiv(query);
    sources.push(...arxivSources);
  }
  
  // Semantic Scholar
  const scholarSources = await searchSemanticScholar(query);
  sources.push(...scholarSources.slice(0, 2));

  let content = `🔍 **PESQUISA NEURAL CONCLUÍDA**\n\n`;
  
  if (sources.length > 0) {
    content += `📊 **Fontes encontradas (${sources.length} resultados):**\n\n`;
    sources.slice(0, 3).forEach((source, i) => {
      const icon = source.type === 'wikipedia' ? '📖' : source.type === 'arxiv' ? '🔬' : '📚';
      content += `${icon} **${source.title.slice(0, 80)}${source.title.length > 80 ? '...' : ''}**\n`;
      content += `[Acessar fonte](${source.url})\n\n`;
    });
  } else {
    content += `❌ Nenhuma fonte acadêmica encontrada para "${query}"\n`;
  }

  return { content, sources };
};

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

  useEffect(() => {
    const savedId = localStorage.getItem('untbot_last_id');
    if (savedId) setUserId(savedId);
  }, []);

  // PDF MAPA MENTAL AVANÇADO
  const exportarMapaMentalPDF = (mensagem: Message) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    // Header Neural
    doc.setFillColor(227, 6, 19);
    doc.rect(0, 0, 297, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text("🧠 SINAPSE NEURAL - MAPA MENTAL", 20, 20);
    doc.setFontSize(10);
    doc.text(`ID: ${userId.toUpperCase()} | ${new Date().toLocaleDateString('pt-BR')} | ${mensagem.type?.toUpperCase() || 'CHAT'}`, 20, 28);
    
    // Título Central (Nó Principal)
    doc.setFontSize(16);
    doc.setTextColor(50, 50, 50);
    doc.setFont('helvetica', 'bold');
    const titulo = mensagem.content.split('\n')[0].slice(0, 60) || 'Conversa Neural';
    doc.text(titulo, 148, 60, { align: 'center' });
    
    // Desenhar nó central
    doc.setFillColor(255, 107, 107);
    doc.circle(148, 55, 12, 'F');
    
    // Conteúdo principal em formato de mapa
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    const linhas = mensagem.content.replace(/[*#]/g, '').split('\n').slice(0, 20);
    
    let yPos = 90;
    linhas.forEach((linha, i) => {
      if (linha.trim() && yPos < 200) {
        // Linhas conectadas ao centro
        doc.setDrawColor(200, 200, 200);
        doc.line(148, 67, i % 2 === 0 ? 50 : 246, yPos);
        
        doc.text(linha.slice(0, 100), i % 2 === 0 ? 55 : 155, yPos);
        yPos += 12;
      }
    });
    
    // Tabela de fontes (se existirem)
    if (mensagem.sources && mensagem.sources.length > 0) {
      doc.setFontSize(9);
      doc.text("📚 FONTES NEURAIS", 20, yPos + 10);
      
      autoTable(doc, {
        startY: yPos + 15,
        head: [['Tipo', 'Título', 'Link']],
        body: mensagem.sources.slice(0, 8).map(s => [
          s.type === 'wikipedia' ? '📖 Wiki' : s.type === 'arxiv' ? '🔬 Arxiv' : '📚 Scholar',
          s.title.slice(0, 30) + (s.title.length > 30 ? '...' : ''),
          s.url.slice(0, 40) + '...'
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [227, 6, 19], textColor: 255 },
        alternateRowStyles: { fillColor: [255, 255, 255] }
      });
    }
    
    doc.save(`🧠_mapa_mental_${userId || 'lab'}_${Date.now()}.pdf`);
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

  const addMessage = (role: "user" | "assistant", content: string, sources?: Source[], type?: Message['type']) => {
    const msg: Message = { 
      id: Date.now().toString() + Math.random(), 
      role, 
      content, 
      timestamp: new Date(),
      sources,
      type 
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

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const userMsg = input.trim();

    if (!userId) {
      setUserId(userMsg.toLowerCase());
      localStorage.setItem('untbot_last_id', userMsg.toLowerCase());
    }

    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);

    try {
      const idParaBusca = userId || userMsg.toLowerCase();
      const historico = await buscarDoRedis(idParaBusca);
      
      const intencao = detectarIntencao(userMsg);
      
      let resposta: string;
      let sources: Source[] = [];
      
      if (intencao === 'research') {
        // Modo Pesquisa Avançada
        const pesquisa = await pesquisarInformacao(userMsg);
        resposta = pesquisa.content;
        sources = pesquisa.sources;
        
        // Contexto para Groq com pesquisa
        const contexto = `MODO PESQUISA | Histórico: ${historico.join(" | ")} | Fontes: ${sources.map(s => s.title).join('; ')}`;
        const analiseGroq = await analisarComGroq(userMsg, contexto);
        resposta += `\n\n🤖 **Análise Neural:**\n${analiseGroq}`;
      } else {
        // Modo Conversa Normal
        const contexto = `MODO CONVERSA | Você é Aura AI do Lab Neuro-UNINTA. Mestre: Matheus. Operador: ${idParaBusca}. Histórico: ${historico.join(" | ")}`;
        resposta = await analisarComGroq(userMsg, contexto);
      }
      
      await salvarNoRedis(idParaBusca, `U: ${userMsg} | B: ${resposta}`);
      addMessage("assistant", resposta, sources, intencao);
      falarTexto(resposta.slice(0, 200) + '...');
    } catch (error) {
      addMessage("assistant", "⚠️ Erro de conexão neural. Verifique sua conexão.", [], 'chat');
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

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans relative selection:bg-primary/30">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-[120px]" />
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

      <div className={`flex-1 flex flex-col min-w-0 relative z-10 transition-all duration-500 ${sidebarOpen ? "blur-md scale-[0.98] pointer-events-none lg:blur-none lg:scale-100 lg:pointer-events-auto" : ""}`}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-background/40 backdrop-blur-xl">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground"><Menu size={20} /></button>
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]"></span>
            </div>
            <h1 className="text-xs font-bold font-mono tracking-[0.2em] text-primary uppercase text-glow">
              UNINTA // {userId || "AGUARDANDO_ID"} {isTyping && '// PROCESSANDO'}
            </h1>
          </div>
          <button onClick={() => {
            const id = Date.now().toString();
            setConversations(prev => [{ id, title: "Nova conversa", messages: [], createdAt: new Date() }, ...prev]);
            setActiveConvId(id);
          }} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground"><Plus size={20} /></button>
        </header>

        <main className="flex-1 overflow-y-auto chat-scrollbar relative scroll-smooth px-4 bg-gradient-to-b from-transparent to-black/20">
          {!messages.length ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8 opacity-80 scale-90 drop-shadow-2xl">
                <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={audioAnalyzer.isProcessing} size="md" />
              </motion.div>
              <h2 className="text-3xl font-semibold tracking-tight text-white/90 mb-2">🧠 Aura Neural Lab</h2>
              <div className="flex gap-4 text-sm text-muted-foreground mb-6">
                <div className="flex items-center gap-1 bg-white/5 px-3 py-1 rounded-full">
                  <Search size={14
                                  <div className="flex gap-4 text-sm text-muted-foreground mb-6">
                <div className="flex items-center gap-1 bg-white/5 px-3 py-1 rounded-full">
                  <Search size={14} /> Pesquise qualquer coisa
                </div>
                <div className="flex items-center gap-1 bg-white/5 px-3 py-1 rounded-full">
                  <MessageCircle size={14} /> Ou converse normalmente
                </div>
              </div>
              <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground/40 italic">Lab Neuro-UNINTA // Multiverse Online</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full py-10 space-y-8">
              <AnimatePresence mode="popLayout">
                {messages.map((msg) => (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center border-2 border-primary/30 shrink-0 shadow-[0_0_20px_rgba(var(--primary),0.2)]">
                        {msg.type === 'research' ? (
                          <Search size={16} className="text-primary" />
                        ) : (
                          <Zap size={16} className="text-primary animate-pulse" />
                        )}
                      </div>
                    )}
                    <div className={`p-5 rounded-3xl max-w-[90%] text-sm leading-relaxed backdrop-blur-lg border shadow-2xl ${msg.role === "user" ? "bg-gradient-to-r from-primary/90 to-primary/70 text-primary-foreground border-primary/30" : "bg-white/8 border-white/15 text-white/95 backdrop-blur-xl"}`}>
                      {/* BADGE DE TIPO */}
                      {msg.role === 'assistant' && msg.type && (
                        <div className="inline-flex items-center gap-1 mb-3 px-3 py-1 rounded-full text-xs font-bold bg-white/10 border border-white/20 w-fit">
                          {msg.type === 'research' ? <Search size={12} /> : <MessageCircle size={12} />}
                          {msg.type === 'research' ? 'MODO PESQUISA' : 'MODO CONVERSA'}
                        </div>
                      )}
                      
                      <ReactMarkdown className="prose prose-invert prose-sm max-w-none leading-relaxed">{msg.content}</ReactMarkdown>
                      
                      {/* LEGENDA DE FONTES COM LINKS */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-white/10">
                          <p className="text-xs font-bold uppercase tracking-wider text-primary/80 mb-3 flex items-center gap-2">
                            📚 <span>Fontes Neurais</span> ({msg.sources.length})
                          </p>
                          <div className="space-y-2">
                            {msg.sources.slice(0, 5).map((source, i) => (
                              <a 
                                key={i}
                                href={source.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="group flex items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-xs hover:scale-[1.02]"
                              >
                                {source.type === 'wikipedia' && <BookOpen size={14} className="text-blue-400" />}
                                {source.type === 'arxiv' && <Zap size={14} className="text-orange-400" />}
                                {source.type === 'scholar' && <Brain size={14} className="text-green-400" />}
                                
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium group-hover:underline truncate">{source.title}</p>
                                  <p className="text-white/60 truncate">{source.url}</p>
                                </div>
                                <Link size={14} className="text-muted-foreground group-hover:translate-x-1 transition-transform flex-shrink-0" />
                              </a>
                            ))}
                            {msg.sources.length > 5 && (
                              <p className="text-xs text-muted-foreground text-center pt-2">+{msg.sources.length - 5} fontes</p>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* BOTÕES DE AÇÃO */}
                      {msg.role === 'assistant' && (
                        <div className="mt-4 flex gap-2 flex-wrap">
                          <button 
                            onClick={() => exportarMapaMentalPDF(msg)} 
                            className="flex items-center gap-2 text-[11px] bg-gradient-to-r from-primary/90 to-purple-600 text-primary-foreground px-4 py-2 rounded-xl border border-primary/30 font-bold uppercase tracking-tight hover:shadow-[0_0_20px_rgba(var(--primary),0.4)] transition-all active:scale-95"
                          >
                            <FileText size={12} /> 🧠 Mapa Mental PDF
                          </button>
                          {msg.sources?.length > 0 && (
                            <button 
                              onClick={() => {
                                msg.sources?.forEach(source => window.open(source.url, '_blank'));
                              }}
                              className="flex items-center gap-1 text-[11px] bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl border border-white/20 font-bold uppercase tracking-tight transition-all text-xs"
                            >
                              🔗 Todas Fontes
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {isTyping && (
                <div className="flex gap-4 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center border-2 border-primary/30 shadow-[0_0_20px_rgba(var(--primary),0.2)]">
                    <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
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
            <div className="relative z-20 flex items-end gap-3 bg-black/85 border border-white/15 rounded-[2rem] p-3 transition-all duration-300 backdrop-blur-[50px] shadow-[0_-15px_50px_rgba(0,0,0,0.6)]">
              <button 
                onClick={toggleVoice} 
                className={`p-3 rounded-2xl transition-all font-bold shadow-lg ${audioAnalyzer.isActive ? "bg-gradient-to-r from-destructive to-red-600 text-white shadow-[0_0_25px_rgba(var(--destructive),0.6)]" : "text-muted-foreground hover:bg-white/10 hover:text-primary"}`}
              >
                {audioAnalyzer.isActive ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              
              <textarea 
                ref={textareaRef} 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown} 
                placeholder={userId ? "💭 Digite para conversar ou 'pesquise [tópico]' para pesquisa neural..." : "👤 Digite seu nome para ativar..."} 
                rows={1} 
                autoComplete="off"
                spellCheck="false"
                style={{ border: 'none', boxShadow: 'none', outline: 'none', background: 'transparent' }}
                className="flex-1 bg-transparent border-0 focus:border-0 focus:ring-0 focus:outline-none resize-none text-sm py-3.5 placeholder:text-muted-foreground/40 font-sans chat-scrollbar overflow-y-auto shadow-none outline-none appearance-none text-white selection:bg-primary/40 min-h-[20px]" 
              />
              
              <button 
                onClick={handleSend} 
                disabled={!input.trim() || isTyping} 
                className="group p-3.5 bg-gradient-to-r from-primary to-purple-600 text-primary-foreground rounded-2xl disabled:opacity-30 disabled:cursor-not-allowed shadow-xl active:scale-95 transition-all hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] hover:from-primary/90"
              >
                {isTyping ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} className="group-hover:translate-x-1 transition-transform duration-200" />
                )}
              </button>
            </div>
            <p className="text-center text-[9px] text-muted-foreground/30 mt-5 font-mono uppercase tracking-[0.6em] animate-pulse flex items-center justify-center gap-2">
              Neural Lab // Aura 7.0 
              <span className="text-primary text-[11px] font-bold">🧠</span>
            </p>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-[100] bg-gradient-to-br from-black/98 via-purple-900/50 to-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-8"
          >
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent mb-2">
                🎤 Modo Voz Ativo
              </h2>
              <p className="text-sm text-white/60">Fale seu comando ou pesquisa</p>
            </div>
            <NeuralOrb 
              isActive={audioAnalyzer.isActive} 
              volume={audioAnalyzer.volume} 
              frequency={audioAnalyzer.frequency} 
              isProcessing={audioAnalyzer.isProcessing} 
              size="lg" 
            />
            <button 
              onClick={toggleVoice} 
              className="mt-16 p-6 rounded-3xl bg-gradient-to-r from-destructive/20 to-red-600/20 text-destructive border-2 border-destructive/30 hover:bg-destructive/30 hover:text-white hover:border-destructive transition-all shadow-[0_0_40px_rgba(var(--destructive),0.3)] backdrop-blur-xl font-bold text-lg"
            >
              <MicOff size={28} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
