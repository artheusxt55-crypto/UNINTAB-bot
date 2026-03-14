import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Plus, Menu, Loader2, Zap, FileText, Search, BookOpen, User, Clock, Award } from "lucide-react";
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
  isAcademic?: boolean;
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
          className="w-1.5 h-1.5 rounded-full bg-indigo-500"
          animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
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

  const fetchAcademicData = async (query: string) => {
    try {
      const [wikiRes, arxivRes] = await Promise.all([
        fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`).then(r => r.ok ? r.json() : null),
        fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=1`).then(r => r.text())
      ]);
      let data = "";
      if (wikiRes?.extract) data += `\n[WIKIPEDIA]: ${wikiRes.extract}`;
      if (arxivRes.includes("<title>")) {
        const title = arxivRes.split("<title>")[2]?.split("</title>")[0] || "";
        data += `\n[ARXIV]: Estudo sobre ${title}`;
      }
      data += `\n[SCIELO]: Buscar artigos relacionados a ${query} na base SciELO Brasil.`;
      return data;
    } catch (e) { return ""; }
  };

  const handleExportPDF = (texto: string) => {
    const doc = new jsPDF();
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text("AURA IA - RELATÓRIO ACADÊMICO", 15, 18);
    doc.setFontSize(8);
    doc.text(`ID: ${userId?.toUpperCase()} | DATA: ${new Date().toLocaleString()}`, 145, 18);
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(texto.replace(/[*#]/g, ''), 180);
    doc.text(splitText, 15, 45);
    doc.save(`aura_study_${Date.now()}.pdf`);
  };

  const activeConversation = conversations.find((c) => c.id === activeConvId) || conversations[0];
  const messages = activeConversation.messages;

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  const addMessage = (role: "user" | "assistant", content: string, isAcademic?: boolean) => {
    const msg: Message = { id: Math.random().toString(36), role, content, timestamp: new Date(), isAcademic };
    setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, messages: [...c.messages, msg], title: (c.messages.length === 0 && role === "user") ? content.slice(0, 30) : c.title } : c));
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const userMsg = input.trim();
    if (!userId) { setUserId(userMsg.toLowerCase()); localStorage.setItem('untbot_last_id', userMsg.toLowerCase()); }
    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);
    try {
      const hist = await buscarDoRedis(userId || userMsg.toLowerCase());
      const intent = await analisarComGroq(`Analise: "${userMsg}". Responda apenas "BUSCA" ou "NORMAL".`, "Classificador.");
      const isAcademicReq = intent.includes("BUSCA");
      const academicData = isAcademicReq ? await fetchAcademicData(userMsg) : "";
      const prompt = `Operador: ${userId}. Contexto Acadêmico: ${academicData}. Histórico: ${hist.join("|")}. Responda como Aura IA do Lab Neuro-UNINTA. Mencione cursos da USP, UFRGS ou CBI se relevante.`;
      const resposta = await analisarComGroq(userMsg, prompt);
      await salvarNoRedis(userId || userMsg.toLowerCase(), `U: ${userMsg} | B: ${resposta}`);
      addMessage("assistant", resposta, isAcademicReq);
      falarTexto(resposta);
    } catch { addMessage("assistant", "⚠️ Falha na sinapse neural."); }
    finally { setIsTyping(false); }
  };
  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <ChatSidebar 
        conversations={conversations} activeConvId={activeConvId}
        onSelect={(id) => { setActiveConvId(id); setSidebarOpen(false); }}
        onNew={() => { const id = Date.now().toString(); setConversations(prev => [{id, title: "Nova sessão", messages: [], createdAt: new Date()}, ...prev]); setActiveConvId(id); }}
        isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}
      />

      <div className={`flex-1 flex flex-col min-w-0 relative transition-all duration-500 ${sidebarOpen ? "lg:ml-0" : ""}`}>
        <header className="h-16 border-b border-slate-800/50 bg-slate-900/95 backdrop-blur-xl sticky top-0 z-20 flex items-center px-6 gap-4">
          <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-slate-800 rounded-xl lg:hidden"><Menu size={20} /></button>
          <div className="flex items-center gap-3 flex-1">
            <div className="h-10 w-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tighter text-white uppercase">Aura IA 2.0</h1>
              <p className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest">{userId || "Offline"}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-8 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-50">
              <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={isTyping} size="lg" />
              <p className="mt-8 font-mono text-xs tracking-[0.5em] uppercase">Inicie uma pesquisa neural</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8">
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`flex gap-4 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-indigo-600" : "bg-slate-800 border border-slate-700"}`}>
                      {msg.role === "user" ? <User size={14} /> : (msg.isAcademic ? <Search size={14} className="text-indigo-400" /> : <Zap size={14} />)}
                    </div>
                    <div className={`rounded-2xl px-5 py-4 shadow-xl ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-900/50 border border-slate-800 text-slate-200"}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-invert prose-sm max-w-none">
                        {msg.content}
                      </ReactMarkdown>
                      {msg.role === 'assistant' && (
                        <button onClick={() => handleExportPDF(msg.content)} className="mt-4 flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest bg-white/5 hover:bg-white/10 p-2 rounded-md transition-all">
                          <FileText size={12} /> Exportar Relatório
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              {isTyping && <div className="flex gap-4"><div className="w-8 h-8 bg-slate-800 rounded-lg animate-pulse" /><TypingIndicator /></div>}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <footer className="p-6 bg-slate-950/80 backdrop-blur-md">
          <div className="max-w-3xl mx-auto relative">
            <div className="flex items-end gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl">
              <button onClick={() => { if(audioAnalyzer.isActive) { audioAnalyzer.stop(); setShowVoiceOrb(false); } else { audioAnalyzer.start(); setShowVoiceOrb(true); } }} className={`p-3 rounded-xl transition-all ${audioAnalyzer.isActive ? "bg-red-500 text-white" : "hover:bg-slate-800 text-slate-400"}`}>
                {audioAnalyzer.isActive ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <textarea 
                ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Injete um comando ou peça uma pesquisa..."
                className="flex-1 bg-transparent border-0 focus:ring-0 text-sm py-3 resize-none max-h-32"
                rows={1}
              />
              <button onClick={handleSend} disabled={!input.trim() || isTyping} className="p-3 bg-indigo-600 text-white rounded-xl disabled:opacity-20 hover:bg-indigo-500 transition-all">
                {isTyping ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </div>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-3xl flex flex-col items-center justify-center">
             <NeuralOrb isActive={audioAnalyzer.isActive} volume={audioAnalyzer.volume} frequency={audioAnalyzer.frequency} isProcessing={false} size="2xl" />
             <button onClick={() => { audioAnalyzer.stop(); setShowVoiceOrb(false); }} className="mt-20 p-6 bg-red-500/10 text-red-500 border border-red-500/20 rounded-full hover:bg-red-500 hover:text-white transition-all">
               <MicOff size={32} />
             </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
