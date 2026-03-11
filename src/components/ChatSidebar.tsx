import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Plus, X } from "lucide-react";

interface Conversation {
  id: string;
  title: string;
  messages: any[];
  createdAt: Date;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  activeConvId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatSidebar({ conversations, activeConvId, onSelect, onNew, isOpen, onClose }: ChatSidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <motion.aside
        className={`fixed lg:relative z-50 h-full w-[280px] flex flex-col bg-sidebar border-r border-sidebar-border ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} transition-transform duration-300 ease-in-out`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <span className="text-xs font-mono tracking-widest text-sidebar-foreground/60 uppercase">Conversas</span>
          <div className="flex items-center gap-1">
            <button onClick={onNew} className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground">
              <Plus size={16} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground/70 lg:hidden">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto chat-scrollbar p-2 space-y-1">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                conv.id === activeConvId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <MessageSquare size={14} className="flex-shrink-0 opacity-50" />
              <span className="truncate">{conv.title}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center neural-glow-subtle" style={{ background: "hsl(var(--neural-red) / 0.1)" }}>
              <div className="w-2 h-2 rounded-full bg-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-sidebar-foreground">Neural AI</p>
              <p className="text-[10px] text-sidebar-foreground/40 font-mono">v1.0.0</p>
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
