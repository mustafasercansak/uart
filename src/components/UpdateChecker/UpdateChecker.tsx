import { useEffect, useState } from 'react';
import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useTranslation } from '../../i18n/context';
import { ArrowUpCircle, X } from 'lucide-react';

export function UpdateChecker() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<Update | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    check()
      .then((u) => {
        if (u?.available) {
          setUpdate(u);
        }
      })
      .catch(() => {
        // Silently ignore — no network or no update on startup
      });
  }, []);

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
    }
  }

  if (!update) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-80 bg-gray-950 border border-cyan-500/30 rounded-2xl shadow-2xl p-5 animate-in slide-in-from-right-10 duration-300">
      <div className="flex items-start gap-4">
        <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
          <ArrowUpCircle className="w-5 h-5 text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-cyan-400 text-xs font-black uppercase tracking-widest">
              {t('system.updateAvailable', { version: update.version })}
            </h4>
            {!downloading && (
              <button onClick={() => setUpdate(null)} className="text-gray-600 hover:text-gray-400">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {update.body && (
            <p className="text-gray-500 text-[10px] mt-1 line-clamp-2 leading-relaxed">
              {update.body}
            </p>
          )}

          {downloading ? (
            <div className="mt-4 space-y-2">
              <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-cyan-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-gray-600 text-[9px] font-mono uppercase tracking-widest">
                {t('system.downloading', { progress })}
              </div>
            </div>
          ) : (
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleUpdate}
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black uppercase tracking-widest py-2 px-3 rounded-lg transition-all shadow-lg shadow-cyan-950"
              >
                {t('system.install')}
              </button>
              <button
                onClick={() => setUpdate(null)}
                className="text-gray-500 hover:text-gray-300 text-[10px] font-black uppercase tracking-widest py-2 px-3 rounded-lg border border-gray-800 hover:border-gray-700 transition-all"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
