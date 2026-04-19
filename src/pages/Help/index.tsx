import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Book, HelpCircle, FileText, Globe, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n/LanguageContext';

type DocType = 'tr' | 'en' | 'readme';

const HelpPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DocType>('tr');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const docs = {
    tr: { title: 'Kullanım Kılavuzu', file: '/docs/KULLANIM_KILAVUZU.md', icon: Book, lang: 'Türkçe' },
    en: { title: 'Quick Help', file: '/docs/HELP.md', icon: HelpCircle, lang: 'English' },
    readme: { title: 'README', file: '/docs/README.md', icon: FileText, lang: 'General' }
  };

  useEffect(() => {
    const fetchDoc = async () => {
      setLoading(true);
      try {
        const response = await fetch(docs[activeTab].file);
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setContent(t('helpPage.loadError'));
      } finally {
        setLoading(false);
      }
    };

    fetchDoc();
    window.scrollTo(0, 0);
  }, [activeTab]);

  return (
    <div className="h-screen bg-[#05070a] text-white flex flex-col font-sans overflow-hidden">
      {/* Absolute Specificity Support */}
      <style>{`
        .markdown-container h1 { color: #ffffff !important; font-size: 3rem !important; margin-bottom: 2rem !important; margin-top: 1rem !important; font-weight: 900 !important; border-bottom: 4px solid rgba(59, 130, 246, 0.2) !important; padding-bottom: 1rem !important; line-height: 1.1 !important; }
        .markdown-container h2 { color: #60a5fa !important; font-size: 1.875rem !important; margin-top: 5rem !important; margin-bottom: 2rem !important; font-weight: 800 !important; border-bottom: 2px solid rgba(59, 130, 246, 0.1) !important; padding-bottom: 0.5rem !important; }
        .markdown-container p, .markdown-container div.paragraph { color: #d1d5db !important; font-size: 1.125rem !important; line-height: 2 !important; margin-bottom: 2rem !important; }
        .markdown-container strong { color: #ffffff !important; font-weight: 900 !important; }
        .markdown-container img { border-radius: 2rem !important; border: 2px solid rgba(255, 255, 255, 0.1) !important; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important; margin: 4rem auto !important; }
      `}</style>

      {/* Top Navbar */}
      <header className="h-20 shrink-0 bg-[#0d1117] border-b border-white/10 px-10 flex items-center justify-between z-50">
         <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 hover:text-white transition-all text-xs font-mono font-black uppercase tracking-widest">
               <ArrowLeft size={18} />
               {t('helpPage.backToSystem')}
            </Link>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex items-center gap-4">
               <div className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20">
                  <Globe size={20} className="text-blue-400" />
               </div>
               <div>
                  <h1 className="text-sm font-black font-mono uppercase tracking-[0.4em] text-white leading-none mb-1">{t('helpPage.archiveTitle')}</h1>
                  <p className="text-[9px] font-mono text-gray-500 uppercase tracking-widest leading-none">{t('helpPage.archiveSubtitle')}</p>
               </div>
            </div>
         </div>
         <div className="hidden sm:flex items-center gap-4 text-[10px] font-mono text-gray-400 uppercase tracking-widest bg-emerald-500/5 border border-emerald-500/10 px-4 py-2 rounded-xl">
            {t('helpPage.systemVersion')} <span className="text-emerald-400 font-black">v1.2.0-STABLE</span>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 shrink-0 border-r border-white/5 bg-[#05070a] p-10 hidden lg:flex flex-col gap-12">
           <section>
              <h3 className="text-[11px] font-mono font-black text-gray-600 uppercase tracking-[0.2em] mb-8 border-l-2 border-blue-500/30 pl-4">{t('helpPage.guideSelection')}</h3>
              <nav className="flex flex-col gap-3">
                 {(Object.keys(docs) as DocType[]).map((key) => {
                    const doc = docs[key];
                    const Icon = doc.icon;
                    return (
                       <button
                         key={key}
                         onClick={() => setActiveTab(key)}
                         className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all border ${
                           activeTab === key 
                           ? 'bg-blue-600 border-blue-500 text-white shadow-2xl shadow-blue-500/20' 
                           : 'bg-white/5 border-transparent text-gray-500 hover:bg-white/10 hover:text-gray-300'
                         }`}
                       >
                          <div className="flex items-center gap-4 text-xs font-mono font-black">
                             <Icon size={18} className={activeTab === key ? 'text-white' : 'text-gray-600'} />
                             {doc.title}
                          </div>
                       </button>
                    );
                 })}
              </nav>
           </section>

           <div className="mt-auto p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10">
              <h4 className="text-[11px] font-mono font-black text-blue-400 uppercase tracking-widest mb-4">{t('helpPage.techNote')}</h4>
              <p className="text-[11px] font-mono leading-relaxed text-gray-500">
                 {t('helpPage.techNoteText')}
              </p>
           </div>
        </aside>

        {/* Content Viewer */}
        <main className="flex-1 overflow-y-auto bg-[#080a0d] custom-scrollbar">
           <div className="max-w-4xl mx-auto px-16 py-32 markdown-container">
              {loading ? (
                 <div className="min-h-[50vh] flex flex-col items-center justify-center gap-8">
                    <div className="w-20 h-20 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin shadow-[0_0_50px_rgba(59,130,246,0.15)]" />
                    <span className="text-sm font-mono text-white animate-pulse tracking-[0.3em] uppercase">{t('helpPage.loadingText')}</span>
                 </div>
              ) : (
                 <article className="prose prose-invert prose-blue max-w-none">
                    <ReactMarkdown 
                      components={{
                        // Hydration fix: Avoid div in p by mapping p to a div with a paragraph class
                        p: ({node, ...props}) => <div className="paragraph" {...props} />,
                        img: ({node, ...props}) => (
                          <span className="flex flex-col items-center my-20 group">
                             <img {...props} alt={props.alt || 'Görsel'} className="hover:scale-[1.01] transition-transform duration-1000 cursor-zoom-in" />
                             {props.alt && (
                                <span className="mt-8 text-[11px] font-mono text-gray-500 uppercase tracking-[0.3em] bg-white/5 px-6 py-2 rounded-full border border-white/10">
                                   Sistem Görüntüsü: {props.alt}
                                </span>
                             )}
                          </span>
                        )
                      }}
                    >
                      {content}
                    </ReactMarkdown>
                 </article>
              )}
              
              <footer className="mt-48 pt-16 border-t border-white/10 flex justify-between items-center text-[11px] font-mono text-gray-600 uppercase tracking-[0.3em] px-4">
                 <div className="flex flex-col gap-3">
                    <span>Mustafa Sercan Sak</span>
                    <span>16 Nisan 2026</span>
                 </div>
                 <div className="flex gap-10">
                    <button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} className="hover:text-blue-400 transition-all font-black">{t('helpPage.scrollTop')}</button>
                 </div>
              </footer>
           </div>
        </main>
      </div>
    </div>
  );
};

export default HelpPage;
