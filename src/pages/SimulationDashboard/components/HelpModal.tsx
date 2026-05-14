import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { X, Book, HelpCircle, FileText, Globe } from 'lucide-react';
import { useTranslation } from '../../../i18n/context';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type DocType = 'tr' | 'en' | 'readme';

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DocType>('tr');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const docs = useMemo(() => ({
    tr: { title: t('helpModal.userGuide'), file: '/docs/GUIDE_TR.md', icon: Book },
    en: { title: t('helpModal.quickHelp'), file: '/docs/GUIDE_EN.md', icon: HelpCircle },
    readme: { title: t('helpModal.readme'), file: '/docs/README.md', icon: FileText }
  }), [t]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchDoc = async () => {
      setLoading(true);
      try {
        const response = await fetch(docs[activeTab].file);
        const text = await response.text();
        setContent(text);
      } catch (_err) {
        setContent(t('helpModal.loadError'));
      } finally {
        setLoading(false);
      }
    };

    fetchDoc();
  }, [isOpen, activeTab, docs, t]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-5xl h-[85vh] bg-[#0a0c10] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="shrink-0 px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
           <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
                 <Globe size={20} className="text-blue-400" />
              </div>
              <div>
                 <h2 className="text-lg font-black font-mono uppercase tracking-widest text-white">{t('helpModal.title')}</h2>
                 <p className="text-[10px] font-mono text-gray-500">{t('helpModal.subtitle')}</p>
              </div>
           </div>
           <button 
             onClick={onClose}
             className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-all"
           >
             <X size={24} />
           </button>
        </div>

        {/* Tab Selection */}
        <div className="shrink-0 px-8 py-3 bg-white/[0.01] border-b border-white/5 flex gap-2 overflow-x-auto no-scrollbar">
           {(Object.keys(docs) as DocType[]).map((key) => {
             const Icon = docs[key].icon;
             return (
               <button
                 key={key}
                 onClick={() => setActiveTab(key)}
                 className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-mono font-bold transition-all border whitespace-nowrap ${
                   activeTab === key 
                   ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                   : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:border-white/10'
                 }`}
               >
                 <Icon size={14} />
                 {docs[key].title}
               </button>
             );
           })}
        </div>

        {/* Markdown Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white/[0.01]">
            {loading ? (
               <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
                  <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                  <span className="text-xs font-mono text-gray-500 animate-pulse">{t('helpModal.loading')}</span>
               </div>
            ) : (
                <article className="prose prose-invert prose-blue max-w-none 
                  prose-headings:font-mono prose-headings:uppercase prose-headings:tracking-widest
                  prose-h1:text-3xl prose-h1:font-black prose-h1:mb-8 prose-h1:pb-4 prose-h1:border-b prose-h1:border-white/10
                  prose-h2:text-xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:text-blue-400
                  prose-h3:text-sm prose-h3:font-bold prose-h3:text-gray-200 prose-h3:mb-4
                  prose-p:text-gray-400 prose-p:leading-relaxed prose-p:mb-4
                  prose-li:text-gray-400 prose-li:mb-2
                  prose-code:text-blue-300 prose-code:bg-blue-900/20 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-2xl
                  prose-img:rounded-[2rem] prose-img:border prose-img:border-white/10 prose-img:shadow-[0_20px_50px_rgba(0,0,0,0.5)] prose-img:my-10
                  prose-strong:text-white prose-strong:font-bold
                  prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-500/5 prose-blockquote:p-4 prose-blockquote:rounded-r-2xl prose-blockquote:italic
                ">
                  <ReactMarkdown
                    rehypePlugins={[rehypeRaw as never]}
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ node: _node, ...props }) => <div className="paragraph mb-4 text-gray-400 leading-relaxed" {...props} />,
                      img: ({node: _node, src, ...props}) => {
                        const fixedSrc = src && !src.startsWith('http') && !src.startsWith('/')
                          ? `/docs/${src}`
                          : src;
                        return (
                          <div className="relative group my-8">
                            <img src={fixedSrc} {...props} style={{maxWidth: '100%'}} className="rounded-2xl border border-white/10 shadow-2xl transition-transform duration-500 group-hover:scale-[1.01]" />
                            {props.alt && (
                              <div className="mt-3 text-center">
                                <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest bg-white/5 px-4 py-1 rounded-full border border-white/10">{props.alt}</span>
                              </div>
                            )}
                          </div>
                        );
                      }
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                </article>
            )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-8 py-4 bg-white/[0.02] border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-gray-600">
           <span>{t('helpModal.docVersion')}</span>
           <div className="flex gap-4">
              <span>© 2026 Mustafa Sercan Sak</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
