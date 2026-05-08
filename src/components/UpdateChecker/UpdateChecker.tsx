import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdateInfo {
  version: string;
  body: string | null;
}

export function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    check()
      .then((u) => {
        if (u?.available) {
          setUpdate({ version: u.version, body: u.body ?? null });
        }
      })
      .catch(() => {
        // Silently ignore — no network or no update
      });
  }, []);

  async function handleUpdate() {
    if (!update) return;
    setDownloading(true);

    const u = await check();
    if (!u?.available) return;

    let downloaded = 0;
    let total = 0;

    await u.downloadAndInstall((event) => {
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
  }

  if (!update) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-gray-900 border border-green-800/50 rounded-xl shadow-2xl p-4 font-mono">
      <div className="flex items-start gap-3">
        <span className="text-green-400 text-lg mt-0.5">↑</span>
        <div className="flex-1 min-w-0">
          <div className="text-green-400 text-sm font-bold">Yeni sürüm: {update.version}</div>
          {update.body && (
            <div className="text-gray-400 text-xs mt-1 line-clamp-2">{update.body}</div>
          )}
          {downloading ? (
            <div className="mt-3">
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-gray-500 text-xs mt-1">{progress}% indiriliyor...</div>
            </div>
          ) : (
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleUpdate}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs py-1.5 px-3 rounded-lg transition-colors"
              >
                Güncelle
              </button>
              <button
                onClick={() => setUpdate(null)}
                className="text-gray-500 hover:text-gray-300 text-xs py-1.5 px-3 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
              >
                Sonra
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
