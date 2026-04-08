import type { Field } from '../../types';

interface Props {
  fields: Field[];
}

const TYPE_COLORS: Record<string, string> = {
  fixed: 'bg-gray-700 border-gray-600 text-gray-300',
  range: 'bg-blue-900/60 border-blue-700 text-blue-300',
  waveform: 'bg-purple-900/60 border-purple-700 text-purple-300',
  checksum: 'bg-orange-900/60 border-orange-700 text-orange-300',
  flags: 'bg-yellow-900/60 border-yellow-700 text-yellow-300',
  computed: 'bg-cyan-900/60 border-cyan-700 text-cyan-300',
  ramp: 'bg-green-900/60 border-green-700 text-green-300',
};

export function FramePreview({ fields }: Props) {
  const totalBytes = fields.reduce((s, f) => s + f.byteWidth, 0);

  return (
    <div className="p-3 bg-gray-950">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 text-xs font-mono">FRAME ÖNİZLEME</span>
        <span className="text-gray-600 text-xs font-mono">{totalBytes} byte</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {fields.map((field) => (
          <div key={field.id} className="flex">
            {Array.from({ length: field.byteWidth }).map((_, i) => (
              <div
                key={i}
                className={`border rounded px-1.5 py-1 text-[10px] font-mono text-center ${TYPE_COLORS[field.type] ?? 'bg-gray-800 text-gray-400 border-gray-700'} ${i === 0 ? '' : 'border-l-0 rounded-l-none'} ${i === field.byteWidth - 1 ? '' : 'rounded-r-none'}`}
                title={`${field.name} — ${field.type}`}
                style={{ minWidth: '2rem' }}
              >
                {i === 0 ? (
                  <div>
                    <div className="truncate max-w-[4rem]">{field.name}</div>
                    <div className="text-[9px] opacity-60">{field.type}</div>
                  </div>
                ) : (
                  <div>
                    <div>+{i}</div>
                    <div className="text-[9px] opacity-60">B{i}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {fields.length === 0 && (
          <div className="text-gray-700 text-xs font-mono">Alan yok — alan ekleyerek başlayın</div>
        )}
      </div>
    </div>
  );
}
