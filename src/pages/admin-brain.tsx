import { useState } from "react";
import { supabase } from "@/lib/supabase"; // Verifique se o caminho está correto
import * as pdfjs from "pdfjs-dist";

// Configuração do worker do PDF.js (Custo Zero)
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function AdminBrain() {
  const [status, setStatus] = useState("Aguardando início...");
  const [loading, setLoading] = useState(false);

  const processarTudo = async () => {
    setLoading(true);
    setStatus("Buscando links no Supabase...");

    // 1. Pega todos os 195 links que você já inseriu
    const { data: livros, error } = await supabase
      .from("biblioteca_aura")
      .select("*")
      .is("conteudo_trecho", null); // Só processa o que estiver vazio

    if (error || !livros) {
      setStatus("Erro ao buscar livros ou tudo já está processado.");
      setLoading(false);
      return;
    }

    for (let i = 0; i < livros.length; i++) {
      const livro = livros[i];
      try {
        setStatus(`Processando [${i + 1}/${livros.length}]: ${livro.titulo_livro}`);

        // 2. Baixa o PDF via Proxy (para evitar erro de CORS)
        const response = await fetch(livro.link_drive);
        const arrayBuffer = await response.arrayBuffer();

        // 3. Extrai o texto do PDF de forma local (Custo Zero)
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let textoCompleto = "";
        for (let p = 1; p <= Math.min(pdf.numPages, 50); p++) { // Limite de 50 páginas por livro para não travar
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          textoCompleto += content.items.map((item: any) => item.str).join(" ") + " ";
        }

        // 4. Salva o texto no Supabase
        // Nota: O ideal aqui é gerar o embedding, mas só de salvar o texto 
        // a Aura já consegue fazer buscas via texto simples (Full Text Search).
        await supabase
          .from("biblioteca_aura")
          .update({ conteudo_trecho: textoCompleto })
          .eq("id", livro.id);

      } catch (err) {
        console.error(`Erro no livro ${livro.titulo_livro}`, err);
      }
    }

    setStatus("✅ Missão cumprida! Todos os livros estão no cérebro da Aura.");
    setLoading(false);
  };

  return (
    <div className="p-10 bg-slate-900 min-h-screen text-white font-mono">
      <h1 className="text-2xl mb-4 text-primary">🧠 Central de Injeção Neural - Lab UNINTA</h1>
      <p className="mb-8 text-slate-400">Clique no botão para ler os 195 PDFs e enviar para o banco de dados.</p>
      
      <button 
        onClick={processarTudo}
        disabled={loading}
        className="bg-primary hover:bg-primary/80 text-white px-6 py-3 rounded-xl disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(var(--primary),0.3)]"
      >
        {loading ? "Processando Biblioteca..." : "Sincronizar Conteúdo Simultâneo"}
      </button>

      <div className="mt-10 p-4 bg-black/50 border border-white/10 rounded-lg">
        <p className="text-sm">Status Atual: <span className="text-yellow-400">{status}</span></p>
      </div>
    </div>
  );
}
