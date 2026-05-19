import React, { useState } from 'react';
import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useTranslation } from '../../i18n/context';
import { X, RefreshCw, ChevronRight, CheckCircle2, AlertCircle, Cpu, User, ExternalLink } from 'lucide-react';
import logo from '../../assets/logo.png';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SystemModal({ isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<'idle' | 'up-to-date' | 'available' | 'error'>('idle');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  if (!isOpen) return null;

  async function handleCheck() {
    setChecking(true);
    setStatus('idle');
    try {
      const u = await check();
      if (u?.available) {
        setUpdate(u);
        setStatus('available');
      } else {
        setStatus('up-to-date');
      }
    } catch (err) {
      console.error(err);
      alert(`Update Error: ${err}`); // Hatayı direkt ekranda görmek için
      setStatus('error');
    } finally {
      setChecking(false);
    }
  }

  async function handleUpdate() {
    if (!update) return;
    setDownloading(true);

    try {
      let downloaded = 0;
      let total = 0;

      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) setProgress(Math.round((downloaded / total) * 100));
        } else if (event.event === 'Finished') {
          setProgress(100);
        }
      });

      await relaunch();
    } catch (err) {
      console.error(err);
      setDownloading(false);
      setStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
          <div className="flex items-center gap-3">
            <img src={logo} alt={t('nav.logoAlt')} className="w-10 h-10 rounded-xl shadow-lg shadow-cyan-500/10" />
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">{t('system.title')}</h3>
              <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">{t('system.core')}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {/* Version Info */}
          <div className="flex items-center justify-between p-4 bg-gray-900/40 border border-gray-800/50 rounded-xl">
            <div className="space-y-1">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">{t('system.version')}</div>
              <div className="text-xl font-mono font-bold text-white">v{__APP_VERSION__}</div>
            </div>
            <div className="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-[10px] font-bold text-green-400 uppercase tracking-widest">
              {t('system.stable')}
            </div>
          </div>

          {/* Update Section */}
          <div className="space-y-3">
            {status === 'idle' && !checking && (
              <button
                onClick={handleCheck}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-all border border-gray-700 hover:border-gray-600 font-bold text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                {t('system.checkUpdate')}
              </button>
            )}

            {checking && (
              <div className="flex items-center justify-center gap-3 p-4 text-gray-400 italic text-sm">
                <RefreshCw className="w-4 h-4 animate-spin text-green-400" />
                {t('system.checking')}
              </div>
            )}

            {status === 'up-to-date' && (
              <div className="flex items-start gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-xl animate-in slide-in-from-top-2">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-green-400">{t('system.upToDate')}</div>
                  <button 
                    onClick={() => setStatus('idle')}
                    className="text-[10px] text-green-600 hover:text-green-500 font-bold uppercase tracking-widest underline underline-offset-2"
                  >
                    {t('system.checkUpdate')}
                  </button>
                </div>
              </div>
            )}

            {status === 'available' && update && (
              <div className="space-y-3 animate-in slide-in-from-top-2">
                <div className="flex items-start gap-3 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-cyan-500 shrink-0" />
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-cyan-400">
                      {t('system.updateAvailable', { version: update.version })}
                    </div>
                    {update.body && (
                      <div className="text-xs text-gray-400 line-clamp-3 mt-2 font-serif italic">
                        "{update.body}"
                      </div>
                    )}
                  </div>
                </div>

                {!downloading ? (
                  <button
                    onClick={handleUpdate}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-all font-bold text-sm shadow-lg shadow-cyan-500/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {t('system.install')}
                  </button>
                ) : (
                  <div className="space-y-2 p-2">
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-cyan-500 transition-all duration-300" 
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                      <span>{t('system.downloading', { progress })}</span>
                      <span>{progress}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {status === 'error' && (
              <div className="flex items-start gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl animate-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-red-400">{t('system.error')}</div>
                  <button 
                    onClick={handleCheck}
                    className="text-[10px] text-red-600 hover:text-red-500 font-bold uppercase tracking-widest underline underline-offset-2"
                  >
                    {t('common.retry') || 'Retry'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* About Section */}
          <div className="pt-4 border-t border-gray-800 space-y-4">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-gray-500">
                <User className="w-3.5 h-3.5" />
                <span>{t('system.developer')}</span>
              </div>
              <span className="text-gray-300 font-bold">Mustafa Sercan Sak</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-gray-500">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{t('system.sourceCode')}</span>
              </div>
              <a 
                href="https://github.com/mustafasercansak/uart" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-cyan-500 hover:text-cyan-400 font-bold flex items-center gap-1"
              >
                GitHub <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-900/30 text-center">
          <p className="text-[10px] text-gray-600 font-mono">
            &copy; {new Date().getFullYear()} UART Simulator &bull; {t('simulation.validation.licensed')}
          </p>
        </div>
      </div>
    </div>
  );
}
