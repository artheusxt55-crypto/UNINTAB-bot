import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Menu, Loader2, User, Download, X } from "lucide-react";
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showVoiceOrb, setShowVoiceOrb] = useState(false);
  const [userId, setUserId] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioAnalyzer = useAudioAnalyzer();

  useEffect(() => {
    const savedId = localStorage.getItem('aura_last_user_id');
    const savedConversations = localStorage.getItem('aura_conversations');
    const lastConvId = localStorage.getItem('aura_last_conv_id');

    if (savedConversations) {
      try {
        const parsed = JSON.parse(savedConversations).map((c: any) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          messages: c.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
        }));
        setConversations(parsed);
      } catch (e) { console.error(e); }
    }

    if (savedId) setUserId(savedId);
    if (lastConvId) setActiveConvId(lastConvId);
  }, []);

  useEffect(() => {
    localStorage.setItem('aura_conversations', JSON.stringify(conversations));
    if (activeConvId) localStorage.setItem('aura_last_conv_id', activeConvId);
  }, [conversations, activeConvId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [conversations, activeConvId, scrollToBottom]);

  const addMessage = (role: "user" | "assistant", content: string, isAcademic = false) => {
    const newMessage: Message = { id: Date.now().toString(), role, content, timestamp: new Date(), isAcademic };
    setConversations(prev => prev.map(conv => 
      conv.id === activeConvId ? { ...conv, messages: [...conv.messages, newMessage] } : conv
    ));
  };

  const handleExportPDF = useCallback((messages: Message[]) => {
    const doc = new jsPDF();
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text("AURA IA - RELATÓRIO ACADÊMICO", 15, 18);
    doc.setFontSize(9);
    doc.text(`ID: ${userId.toUpperCase() || 'ANÔNIMO'} | Data: ${new Date().toLocaleString()}`, 15, 25);
    
    let y = 40;
    messages.forEach((msg) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setTextColor(msg.role === 'user' ? 99 : 16, msg.role === 'user' ? 102 : 185, msg.role === 'user' ? 241 : 129);
      doc.text(msg.role === 'user' ? 'Você:' : 'Aura:', 15, y);
      doc.setTextColor(40, 40, 40);
      const text = doc.splitTextToSize(msg.content.replace(/[*#`]/g, ''), 170);
      doc.text(text, 20, y + 7);
      y += (text.length * 5) + 15;
    });
    doc.save(`aura-relatorio-${Date.now()}.pdf`);
  }, [userId]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const userMsg = input;
    if (!userId) {
      const newId = userMsg.toLowerCase().replace(/\s+/g, '_');
      setUserId(newId);
      localStorage.setItem('aura_last_user_id', newId);
    }
    addMessage("user", userMsg);
    setInput("");
    setIsTyping(true);
    try {
      const resposta = await analisarComGroq(userMsg, `Atue como Aura IA para o aluno ${userId}`);
      addMessage("assistant", resposta);
      falarTexto(resposta);
    } catch (e) {
      addMessage("assistant", "⚠️ Erro na sinapse neural.");
    } finally { setIsTyping(false); }
  };

  const activeConversation = conversations.find(c => c.id === activeConvId);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden">
      <ChatSidebar 
        conversations={conversations} 
        activeConvId={activeConvId} 
        onSelect={setActiveConvId}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNew={() => {
          const id = Date.now().toString();
          setConversations([{ id, title: "Nova sessão", messages: [], createdAt: new Date() }, ...conversations]);
          setActiveConvId(id);
        }}
      />
      <main className="flex-1 flex flex-col relative">
        <header className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 backdrop-blur">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2"><Menu /></button>
          <h1 className="font-bold text-indigo-400">Aura IA</h1>
          {activeConversation?.messages.length! > 0 && (
            <button onClick={() => handleExportPDF(activeConversation!.messages)} className="flex items-center gap-2 text-sm bg-slate-800 p-2 rounded-lg">
              <Download size={16}/> PDF
            </button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeConversation?.messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`p-4 rounded-2xl max-w-[80%] ${m.role === 'user' ? 'bg-indigo-600' : 'bg-slate-900 border border-slate-800'}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
        <footer className="p-4 bg-slate-900/50">
          <div className="max-w-4xl mx-auto flex gap-2">
            <textarea 
              value={input} 
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              className="flex-1 bg-slate-800 border-0 rounded-xl p-3 resize-none"
              placeholder="Digite sua dúvida..."
            />
            <button onClick={handleSend} className="p-4 bg-indigo-600 rounded-xl"><Send /></button>
          </div>
        </footer>
      </main>
    </div>
  );
}
