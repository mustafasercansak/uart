import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Book, FileText, Globe, ArrowLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { useTranslation } from '../../i18n/context';

type DocType = 'master' | 'readme';

const docs = (lang: string) => ({
  master: {
    titleKey: 'helpPage.masterTitle',
    file: lang === 'en' ? '/docs/GUIDE_EN.md' : '/docs/GUIDE_TR.md',
    icon: Book,
    langKey: 'helpPage.masterLang'
  },
  readme: {
    titleKey: 'helpPage.readmeTitle',
    file: '/docs/README.md',
    icon: FileText,
    langKey: 'helpPage.readmeLang'
  }
});

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

function extractToc(markdown: string): TocEntry[] {
  const lines = markdown.split('\n');
  const entries: TocEntry[] = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const rawText = match[2].replace(/[*_`~]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
      // strip leading emojis/numbers for display
      const text = rawText.replace(/^[\d]+\.\s+/, '').replace(/^[^\w\s]*\s*/, '').trim();
      // build id matching react-markdown's heading id generation
      const id = rawText
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      if (text && level <= 2) {
        entries.push({ id, text, level });
      }
    }
    // also capture <a name="..."> anchors from the markdown
    const anchorMatch = line.match(/<a\s+name="([^"]+)"/);
    if (anchorMatch) {
      // next heading will be associated — skip, headings already captured
    }
  }
  return entries;
}

const HelpPage: React.FC = () => {
  const { t, language } = useTranslation();
  const [activeTab, setActiveTab] = useState<DocType>('master');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [activeSection, setActiveSection] = useState<string>('');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDoc = async () => {
      setLoading(true);
      try {
        const availableDocs = docs(language);
        const response = await fetch(availableDocs[activeTab].file);
        const text = await response.text();
        setContent(text);
        setToc(extractToc(text));
        setActiveSection('');
      } catch (_err) {
        setContent(t('helpPage.loadError'));
        setToc([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDoc();
    window.scrollTo(0, 0);
  }, [activeTab, t, language]);

  // Track active section via IntersectionObserver
  useEffect(() => {
    if (loading || !contentRef.current) return;
    const headings = contentRef.current.querySelectorAll('h1, h2, h3');
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-10% 0px -80% 0px', threshold: 0 }
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [loading, content]);

  const scrollToSection = useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${id}, [id="${id}"], a[name="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <div className="h-screen bg-[#05070a] text-white flex flex-col font-sans overflow-hidden">
      <style>{`
        .markdown-container h1 { color: #ffffff !important; font-size: 2.5rem !important; margin-bottom: 1.5rem !important; margin-top: 1rem !important; font-weight: 900 !important; border-bottom: 4px solid rgba(59, 130, 246, 0.2) !important; padding-bottom: 1rem !important; line-height: 1.1 !important; }
        .markdown-container h2 { color: #60a5fa !important; font-size: 1.6rem !important; margin-top: 4rem !important; margin-bottom: 1.5rem !important; font-weight: 800 !important; border-bottom: 2px solid rgba(59, 130, 246, 0.1) !important; padding-bottom: 0.5rem !important; }
        .markdown-container h3 { color: #e2e8f0 !important; font-size: 1.1rem !important; margin-top: 2rem !important; margin-bottom: 1rem !important; font-weight: 700 !important; }
        .markdown-container p, .markdown-container div.paragraph { color: #d1d5db !important; font-size: 1rem !important; line-height: 1.8 !important; margin-bottom: 1.5rem !important; }
        .markdown-container strong { color: #ffffff !important; font-weight: 900 !important; }
        .markdown-container code { background: rgba(59,130,246,0.1) !important; color: #93c5fd !important; padding: 0.15rem 0.4rem !important; border-radius: 0.3rem !important; font-size: 0.875rem !important; }
        .markdown-container pre { background: #0d1117 !important; border: 1px solid rgba(255,255,255,0.08) !important; border-radius: 1rem !important; padding: 1.5rem !important; overflow-x: auto !important; margin: 1.5rem 0 !important; }
        .markdown-container pre code { background: transparent !important; padding: 0 !important; }
        .markdown-container table { width: 100% !important; border-collapse: collapse !important; margin: 2rem 0 !important; }
        .markdown-container th { background: rgba(59,130,246,0.1) !important; color: #93c5fd !important; font-weight: 700 !important; padding: 0.75rem 1rem !important; text-align: left !important; border-bottom: 2px solid rgba(59,130,246,0.2) !important; font-size: 0.8rem !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; }
        .markdown-container td { color: #d1d5db !important; padding: 0.65rem 1rem !important; border-bottom: 1px solid rgba(255,255,255,0.05) !important; font-size: 0.9rem !important; }
        .markdown-container tr:hover td { background: rgba(255,255,255,0.02) !important; }
        .markdown-container ul, .markdown-container ol { color: #d1d5db !important; padding-left: 1.5rem !important; margin-bottom: 1.5rem !important; }
        .markdown-container li { margin-bottom: 0.4rem !important; line-height: 1.7 !important; }
        .markdown-container blockquote { border-left: 4px solid rgba(59,130,246,0.5) !important; background: rgba(59,130,246,0.05) !important; padding: 1rem 1.5rem !important; border-radius: 0 0.75rem 0.75rem 0 !important; margin: 1.5rem 0 !important; }
        .markdown-container blockquote p { margin-bottom: 0 !important; color: #93c5fd !important; }
        .markdown-container hr { border-color: rgba(255,255,255,0.06) !important; margin: 3rem 0 !important; }
        .markdown-container img { border-radius: 1.5rem !important; border: 2px solid rgba(255,255,255,0.1) !important; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5) !important; margin: 3rem auto !important; display: block !important; max-width: 100% !important; }
        .markdown-container a { color: #60a5fa !important; text-decoration: underline !important; text-underline-offset: 2px !important; }
        .toc-active { color: #60a5fa !important; background: rgba(59,130,246,0.08) !important; border-left-color: #3b82f6 !important; }
      `}</style>

      {/* Top Navbar */}
      <header className="h-16 shrink-0 bg-[#0d1117] border-b border-white/10 px-8 flex items-center justify-between z-50">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 hover:text-white transition-all text-xs font-mono font-black uppercase tracking-widest">
            <ArrowLeft size={16} />
            {t('helpPage.backToSystem')}
          </Link>
          <div className="h-5 w-px bg-white/10" />
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/10 rounded-xl border border-blue-500/20">
              <Globe size={18} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-xs font-black font-mono uppercase tracking-[0.4em] text-white leading-none mb-0.5">{t('helpPage.archiveTitle')}</h1>
              <p className="text-[9px] font-mono text-gray-500 uppercase tracking-widest leading-none">{t('helpPage.archiveSubtitle')}</p>
            </div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono text-gray-400 uppercase tracking-widest bg-emerald-500/5 border border-emerald-500/10 px-4 py-2 rounded-xl">
          {t('helpPage.systemVersion')} <span className="text-emerald-400 font-black ml-1">{t('nav.versionLabel', { version: `${__APP_VERSION__}-STABLE` })}</span>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar — Doc selection */}
        <aside className="w-56 shrink-0 border-r border-white/5 bg-[#05070a] p-6 hidden lg:flex flex-col gap-8">
          <section>
            <h3 className="text-[10px] font-mono font-black text-gray-600 uppercase tracking-[0.2em] mb-4 border-l-2 border-blue-500/30 pl-3">{t('helpPage.guideSelection')}</h3>
            <nav className="flex flex-col gap-2">
              {(Object.keys(docs(language)) as DocType[]).map((key) => {
                const doc = docs(language)[key];
                const Icon = doc.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all border text-left ${
                      activeTab === key
                        ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-500/20'
                        : 'bg-white/5 border-transparent text-gray-500 hover:bg-white/10 hover:text-gray-300'
                    }`}
                  >
                    <Icon size={15} className={activeTab === key ? 'text-white' : 'text-gray-600'} />
                    <span className="text-[11px] font-mono font-black truncate">{t(doc.titleKey)}</span>
                  </button>
                );
              })}
            </nav>
          </section>

          <div className="mt-auto p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
            <h4 className="text-[10px] font-mono font-black text-blue-400 uppercase tracking-widest mb-2">{t('helpPage.techNote')}</h4>
            <p className="text-[10px] font-mono leading-relaxed text-gray-500">
              {t('helpPage.techNoteText')}
            </p>
          </div>
        </aside>

        {/* Content Viewer */}
        <main className="flex-1 overflow-y-auto bg-[#080a0d] custom-scrollbar" ref={contentRef}>
          <div className="max-w-3xl mx-auto px-10 py-20 markdown-container">
            {loading ? (
              <div className="min-h-[50vh] flex flex-col items-center justify-center gap-8">
                <div className="w-16 h-16 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin shadow-[0_0_50px_rgba(59,130,246,0.15)]" />
                <span className="text-sm font-mono text-white animate-pulse tracking-[0.3em] uppercase">{t('helpPage.loadingText')}</span>
              </div>
            ) : (
              <article className="prose prose-invert prose-blue max-w-none">
                <ReactMarkdown
                  rehypePlugins={[rehypeRaw as never]}
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ node: _node, ...props }) => <div className="paragraph" {...props} />,
                    img: ({ node: _node, src, ...props }) => {
                      const fixedSrc = src && !src.startsWith('http') && !src.startsWith('/')
                        ? `/docs/${src}`
                        : src;
                      return (
                        <span className="flex flex-col items-center my-16 group">
                          <img src={fixedSrc} {...props} alt={props.alt || t('helpPage.systemImage')} className="hover:scale-[1.01] transition-transform duration-700 cursor-zoom-in" />
                          {props.alt && (
                            <span className="mt-5 text-[10px] font-mono text-gray-500 uppercase tracking-[0.3em] bg-white/5 px-5 py-1.5 rounded-full border border-white/10">
                              {props.alt}
                            </span>
                          )}
                        </span>
                      );
                    }
                  }}
                >
                  {content}
                </ReactMarkdown>
              </article>
            )}

            <footer className="mt-32 pt-12 border-t border-white/10 flex justify-between items-center text-[10px] font-mono text-gray-600 uppercase tracking-[0.3em]">
              <div className="flex flex-col gap-2">
                <span>{t('helpPage.developer')}</span>
                <span>{t('helpPage.date')}</span>
              </div>
              <button onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} className="hover:text-blue-400 transition-all font-black">
                {t('helpPage.scrollTop')}
              </button>
            </footer>
          </div>
        </main>

        {/* Right Sidebar — Table of Contents */}
        {toc.length > 0 && (
          <aside className="w-52 shrink-0 border-l border-white/5 bg-[#05070a] py-8 px-4 hidden xl:flex flex-col overflow-y-auto custom-scrollbar">
            <h3 className="text-[10px] font-mono font-black text-gray-600 uppercase tracking-[0.2em] mb-5 pl-2">
              {language === 'tr' ? 'İçindekiler' : 'On This Page'}
            </h3>
            <nav className="flex flex-col gap-0.5">
              {toc.map((entry) => {
                const isActive = activeSection === entry.id;
                return (
                  <button
                    key={entry.id}
                    onClick={() => scrollToSection(entry.id)}
                    className={`text-left text-[10px] font-mono leading-snug py-1 px-2 rounded transition-all border-l-2 ${
                      entry.level === 1 ? 'font-bold pl-2' : 'pl-4 text-[9.5px]'
                    } ${
                      isActive
                        ? 'toc-active'
                        : 'text-gray-600 border-transparent hover:text-gray-300 hover:border-white/20'
                    }`}
                  >
                    {entry.level > 1 && <ChevronRight size={8} className="inline mr-1 opacity-50" />}
                    {entry.text}
                  </button>
                );
              })}
            </nav>
          </aside>
        )}
      </div>
    </div>
  );
};

export default HelpPage;
