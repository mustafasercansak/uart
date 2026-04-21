import type {
  Field,
  FieldType,
  FixedConfig,
  RangeConfig,
  RampConfig,
  WaveformConfig,
  ChecksumConfig,
  FlagsConfig,
  ComputedConfig,
  ScriptConfig,
  FlagBit,
  BitBehavior,
  ChecksumAlgorithm,
  WaveformShape,
} from '../../types';
import { useTranslation } from '../../i18n/context';

interface Props {
  field: Field;
  allFields: Field[];
  onChange: (field: Field) => void;
}

const inputCls = 'bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 outline-none focus:border-green-700 w-full';
const labelCls = 'text-gray-500 text-xs font-mono block mb-1';
const sectionCls = 'mb-4';

export function FieldEditor({ field, allFields, onChange }: Props) {
  const { t } = useTranslation();
  const update = (patch: Partial<Field>) => onChange({ ...field, ...patch });
  const updateConfig = (patch: object) =>
    onChange({ ...field, typeConfig: { ...field.typeConfig, ...patch } });

  const changeType = (type: FieldType) => {
    const defaultConfigs: Record<FieldType, object> = {
      fixed: { value: 0xAA },
      range: { min: 0, max: 255, distribution: 'uniform' },
      ramp: { from: 0, to: 255, durationMs: 5000, curve: 'linear' },
      waveform: { shape: 'sine', frequency: 1.0, amplitude: 100, offset: 128, noiseLevel: 5 },
      checksum: { algorithm: 'xor', scope: { startFieldId: allFields[0]?.id ?? '', endFieldId: allFields[allFields.length - 1]?.id ?? '' } },
      flags: { bits: [{ index: 0, name: 'Bit 0', defaultValue: 0, behavior: 'fixed', behaviorConfig: {} }] },
      computed: { expression: "fields['Veri'] * 2", clampMin: 0, clampMax: 255 },
      script: { code: "// t: elapsed ms, i: frame count, f: named values\nreturn Math.sin(t/1000) * 100 + 128;" },
    };
    onChange({ ...field, type, typeConfig: defaultConfigs[type] as Field['typeConfig'] });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="text-green-400 text-xs font-mono font-bold uppercase tracking-wider border-b border-gray-800 pb-2">
        {t('profileEditor.fieldConfig')}
      </div>

      {/* Base properties */}
      <div className={sectionCls}>
        <div className="mb-2">
          <label className={labelCls}>{t('profileEditor.name')}</label>
          <input className={inputCls} value={field.name} onChange={(e) => update({ name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className={labelCls}>{t('profileEditor.byteWidth')}</label>
            <input type="number" min={1} max={4} className={inputCls} value={field.byteWidth} onChange={(e) => update({ byteWidth: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>{t('profileEditor.byteOrder')}</label>
            <select className={inputCls} value={field.endianness} onChange={(e) => update({ endianness: e.target.value as Field['endianness'] })}>
              <option value="big">Big Endian</option>
              <option value="little">Little Endian</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('profileEditor.fieldType')}</label>
          <select className={inputCls} value={field.type} onChange={(e) => changeType(e.target.value as FieldType)}>
            <option value="fixed">{t('profileEditor.fixed')}</option>
            <option value="range">{t('profileEditor.rangeRandom')}</option>
            <option value="ramp">{t('profileEditor.rampTransition')}</option>
            <option value="waveform">{t('profileEditor.waveformType')}</option>
            <option value="checksum">{t('profileEditor.checksumType')}</option>
            <option value="flags">{t('profileEditor.flagsBit')}</option>
            <option value="computed">{t('profileEditor.computed')}</option>
            <option value="script">{t('profileEditor.script')}</option>
          </select>
        </div>
      </div>

      {/* Type-specific config */}
      {field.type === 'fixed' && <FixedEditor config={field.typeConfig as FixedConfig} onChange={updateConfig} />}
      {field.type === 'range' && <RangeEditor config={field.typeConfig as RangeConfig} onChange={updateConfig} />}
      {field.type === 'ramp' && <RampEditor config={field.typeConfig as RampConfig} onChange={updateConfig} />}
      {field.type === 'waveform' && <WaveformEditor config={field.typeConfig as WaveformConfig} onChange={updateConfig} />}
      {field.type === 'checksum' && <ChecksumEditor config={field.typeConfig as ChecksumConfig} allFields={allFields} field={field} onChange={updateConfig} />}
      {field.type === 'flags' && <FlagsEditor config={field.typeConfig as FlagsConfig} onChange={updateConfig} byteWidth={field.byteWidth} />}
      {field.type === 'computed' && <ComputedEditor config={field.typeConfig as ComputedConfig} onChange={updateConfig} allFields={allFields} />}
      {field.type === 'script' && <ScriptEditor config={field.typeConfig as ScriptConfig} onChange={updateConfig} />}
    </div>
  );
}

function FixedEditor({ config, onChange }: { config: FixedConfig; onChange: (p: Partial<FixedConfig>) => void }) {
  const { t } = useTranslation();
  return (
    <div>
      <label className={labelCls}>{t('profileEditor.fixedValue')}</label>
      <input
        className={inputCls}
        value={`0x${config.value.toString(16).toUpperCase().padStart(2, '0')}`}
        onChange={(e) => {
          const v = parseInt(e.target.value, 16);
          if (!isNaN(v)) onChange({ value: v & 0xff });
        }}
      />
      <div className="text-gray-600 text-xs mt-1 font-mono">Decimal: {config.value}</div>
    </div>
  );
}

function RangeEditor({ config, onChange }: { config: RangeConfig; onChange: (p: Partial<RangeConfig>) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Min</label>
          <input type="number" className={inputCls} value={config.min} onChange={(e) => onChange({ min: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>Max</label>
          <input type="number" className={inputCls} value={config.max} onChange={(e) => onChange({ max: Number(e.target.value) })} />
        </div>
      </div>
      <div>
        <label className={labelCls}>{t('profileEditor.distribution')}</label>
        <select className={inputCls} value={config.distribution} onChange={(e) => onChange({ distribution: e.target.value as RangeConfig['distribution'] })}>
          <option value="uniform">{t('profileEditor.uniform')}</option>
          <option value="gaussian">{t('profileEditor.gaussian')}</option>
        </select>
      </div>
      {config.distribution === 'gaussian' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>{t('profileEditor.mean')}</label>
            <input type="number" className={inputCls} value={config.mean ?? (config.min + config.max) / 2} onChange={(e) => onChange({ mean: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>{t('profileEditor.stddev')}</label>
            <input type="number" step="0.1" className={inputCls} value={config.stddev ?? 1} onChange={(e) => onChange({ stddev: Number(e.target.value) })} />
          </div>
        </div>
      )}
    </div>
  );
}

function RampEditor({ config, onChange }: { config: RampConfig; onChange: (p: Partial<RampConfig>) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>{t('profileEditor.startValue')}</label>
          <input type="number" className={inputCls} value={config.from} onChange={(e) => onChange({ from: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>{t('profileEditor.endValue')}</label>
          <input type="number" className={inputCls} value={config.to} onChange={(e) => onChange({ to: Number(e.target.value) })} />
        </div>
      </div>
      <div>
        <label className={labelCls}>{t('profileEditor.duration')}</label>
        <input type="number" min={100} className={inputCls} value={config.durationMs} onChange={(e) => onChange({ durationMs: Number(e.target.value) })} />
      </div>
      <div>
        <label className={labelCls}>{t('profileEditor.curve')}</label>
        <select className={inputCls} value={config.curve} onChange={(e) => onChange({ curve: e.target.value as RampConfig['curve'] })}>
          <option value="linear">{t('profileEditor.linear')}</option>
          <option value="ease-in">Ease In</option>
          <option value="ease-out">Ease Out</option>
          <option value="ease-in-out">Ease In-Out</option>
        </select>
      </div>
    </div>
  );
}

function WaveformEditor({ config, onChange }: { config: WaveformConfig; onChange: (p: Partial<WaveformConfig>) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div>
        <label className={labelCls}>{t('profileEditor.waveformType')}</label>
        <select className={inputCls} value={config.shape} onChange={(e) => onChange({ shape: e.target.value as WaveformShape })}>
          <option value="sine">{t('profileEditor.sine')}</option>
          <option value="triangle">{t('profileEditor.triangle')}</option>
          <option value="sawtooth">{t('profileEditor.sawtooth')}</option>
          <option value="square">{t('profileEditor.square')}</option>
          <option value="ecg">{t('profileEditor.ecg')}</option>
          <option value="custom">{t('profileEditor.custom')}</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>{t('profileEditor.frequency')}</label>
          <input type="number" step="0.1" min={0.01} className={inputCls} value={config.frequency} onChange={(e) => onChange({ frequency: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>{t('profileEditor.noiseLevel')}</label>
          <input type="number" min={0} max={50} className={inputCls} value={config.noiseLevel} onChange={(e) => onChange({ noiseLevel: Number(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>{t('profileEditor.amplitude')}</label>
          <input type="number" min={0} className={inputCls} value={config.amplitude} onChange={(e) => onChange({ amplitude: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>{t('profileEditor.offset')}</label>
          <input type="number" className={inputCls} value={config.offset} onChange={(e) => onChange({ offset: Number(e.target.value) })} />
        </div>
      </div>
      {config.shape === 'custom' && (
        <div>
          <label className={labelCls}>{t('profileEditor.customPoints')}</label>
          <input className={inputCls}
            value={(config.customPoints ?? []).join(', ')}
            onChange={(e) => onChange({ customPoints: e.target.value.split(',').map((v) => Number(v.trim())).filter((n) => !isNaN(n)) })}
            placeholder="0, 64, 128, 200, 255, 128, 0"
          />
        </div>
      )}
    </div>
  );
}

function ChecksumEditor({ config, allFields, field, onChange }: {
  config: ChecksumConfig;
  allFields: Field[];
  field: Field;
  onChange: (p: Partial<ChecksumConfig>) => void;
}) {
  const { t } = useTranslation();
  const otherFields = allFields.filter((f) => f.id !== field.id);
  return (
    <div className="space-y-2">
      <div>
        <label className={labelCls}>{t('profileEditor.algorithm')}</label>
        <select className={inputCls} value={config.algorithm} onChange={(e) => onChange({ algorithm: e.target.value as ChecksumAlgorithm })}>
          <option value="xor">XOR</option>
          <option value="sum_mod256">{t('profileEditor.sumMod256')}</option>
          <option value="crc8">CRC-8</option>
          <option value="crc16_ccitt">CRC-16 CCITT</option>
          <option value="crc16_modbus">CRC-16 Modbus</option>
          <option value="crc32">CRC-32</option>
          <option value="custom">{t('profileEditor.custom')}</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>{t('profileEditor.startField')}</label>
        <select className={inputCls} value={config.scope.startFieldId}
          onChange={(e) => onChange({ scope: { ...config.scope, startFieldId: e.target.value } })}>
          {otherFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>{t('profileEditor.endField')}</label>
        <select className={inputCls} value={config.scope.endFieldId}
          onChange={(e) => onChange({ scope: { ...config.scope, endFieldId: e.target.value } })}>
          {otherFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      {['crc16_ccitt', 'crc32', 'custom'].includes(config.algorithm) && (
        <div className="space-y-2 pt-2 border-t border-gray-800">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>{t('profileEditor.initialValue')}</label>
              <input className={inputCls}
                value={`0x${(config.initialValue ?? 0).toString(16).toUpperCase().padStart(4, '0')}`}
                onChange={(e) => { const v = parseInt(e.target.value, 16); if (!isNaN(v)) onChange({ initialValue: v }); }}
              />
            </div>
            <div>
              <label className={labelCls}>Polynomial (hex)</label>
              <input className={inputCls}
                value={`0x${(config.polynomial ?? 0x1021).toString(16).toUpperCase().padStart(4, '0')}`}
                onChange={(e) => { const v = parseInt(e.target.value, 16); if (!isNaN(v)) onChange({ polynomial: v }); }}
              />
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-1 text-xs font-mono text-gray-400 cursor-pointer">
              <input type="checkbox" checked={config.reflectIn ?? false} onChange={(e) => onChange({ reflectIn: e.target.checked })} className="accent-green-500" />
              Reflect In
            </label>
            <label className="flex items-center gap-1 text-xs font-mono text-gray-400 cursor-pointer">
              <input type="checkbox" checked={config.reflectOut ?? false} onChange={(e) => onChange({ reflectOut: e.target.checked })} className="accent-green-500" />
              Reflect Out
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function FlagsEditor({ config, onChange, byteWidth }: {
  config: FlagsConfig;
  onChange: (p: Partial<FlagsConfig>) => void;
  byteWidth: number;
}) {
  const { t } = useTranslation();
  const maxBits = byteWidth * 8;

  const addBit = () => {
    const usedIndices = new Set(config.bits.map((b) => b.index));
    const nextIdx = Array.from({ length: maxBits }, (_, i) => i).find((i) => !usedIndices.has(i)) ?? 0;
    const newBit: FlagBit = { index: nextIdx, name: `Bit ${nextIdx}`, defaultValue: 0, behavior: 'fixed', behaviorConfig: {} };
    onChange({ bits: [...config.bits, newBit] });
  };

  const removeBit = (idx: number) => onChange({ bits: config.bits.filter((_, i) => i !== idx) });

  const updateBit = (idx: number, patch: Partial<FlagBit>) => {
    onChange({ bits: config.bits.map((b, i) => i === idx ? { ...b, ...patch } : b) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-xs font-mono">{t('profileEditor.bitCapacity').replace('{max}', String(maxBits))}</span>
        <button onClick={addBit} className="text-xs px-2 py-0.5 bg-green-900/30 border border-green-800/50 text-green-400 rounded hover:bg-green-900/50">+ Bit</button>
      </div>
      {config.bits.sort((a, b) => a.index - b.index).map((bit, idx) => (
        <div key={idx} className="bg-gray-900 rounded border border-gray-700 p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <select
              className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs font-mono text-gray-200 w-12"
              value={bit.index}
              onChange={(e) => updateBit(idx, { index: Number(e.target.value) })}
            >
              {Array.from({ length: maxBits }, (_, i) => (
                <option key={i} value={i}>B{i}</option>
              ))}
            </select>
            <input
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs font-mono text-gray-200"
              value={bit.name}
              onChange={(e) => updateBit(idx, { name: e.target.value })}
              placeholder={t('profileEditor.name')}
            />
            <button onClick={() => removeBit(idx)} className="text-red-500 hover:text-red-400 text-xs">×</button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-gray-600 text-[10px] font-mono">{t('profileEditor.behavior')}</label>
              <select
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs font-mono text-gray-200 w-full"
                value={bit.behavior}
                onChange={(e) => updateBit(idx, { behavior: e.target.value as BitBehavior, behaviorConfig: {} })}
              >
                <option value="fixed">{t('profileEditor.fixed')}</option>
                <option value="manual">{t('profileEditor.manual')}</option>
                <option value="random">{t('profileEditor.random')}</option>
                <option value="timed">{t('profileEditor.timed')}</option>
              </select>
            </div>
            <div>
              <label className="text-gray-600 text-[10px] font-mono">{t('profileEditor.default')}</label>
              <select
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs font-mono text-gray-200 w-full"
                value={bit.defaultValue}
                onChange={(e) => updateBit(idx, { defaultValue: Number(e.target.value) as 0 | 1 })}
              >
                <option value={0}>0</option>
                <option value={1}>1</option>
              </select>
            </div>
          </div>
          {bit.behavior === 'random' && (() => {
            const cfg = bit.behaviorConfig as Record<string, number>;
            return (
              <div className="grid grid-cols-3 gap-1">
                <div>
                  <label className="text-gray-600 text-[10px] font-mono">{t('profileEditor.probability')}</label>
                  <input type="number" step="0.01" min={0} max={1} className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs font-mono text-gray-200 w-full"
                    value={cfg['probability'] ?? 0.05}
                    onChange={(e) => updateBit(idx, { behaviorConfig: { ...cfg, probability: Number(e.target.value) } as FlagBit['behaviorConfig'] })}
                  />
                </div>
                <div>
                  <label className="text-gray-600 text-[10px] font-mono">Min ms</label>
                  <input type="number" className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs font-mono text-gray-200 w-full"
                    value={cfg['minDurationMs'] ?? 500}
                    onChange={(e) => updateBit(idx, { behaviorConfig: { ...cfg, minDurationMs: Number(e.target.value) } as FlagBit['behaviorConfig'] })}
                  />
                </div>
                <div>
                  <label className="text-gray-600 text-[10px] font-mono">Max ms</label>
                  <input type="number" className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs font-mono text-gray-200 w-full"
                    value={cfg['maxDurationMs'] ?? 2000}
                    onChange={(e) => updateBit(idx, { behaviorConfig: { ...cfg, maxDurationMs: Number(e.target.value) } as FlagBit['behaviorConfig'] })}
                  />
                </div>
              </div>
            );
          })()}
          {bit.behavior === 'timed' && (() => {
            const cfg = bit.behaviorConfig as Record<string, number>;
            return (
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className="text-gray-600 text-[10px] font-mono">{t('profileEditor.activeMs')}</label>
                  <input type="number" className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs font-mono text-gray-200 w-full"
                    value={cfg['activateAtMs'] ?? 0}
                    onChange={(e) => updateBit(idx, { behaviorConfig: { ...cfg, activateAtMs: Number(e.target.value) } as FlagBit['behaviorConfig'] })}
                  />
                </div>
                <div>
                  <label className="text-gray-600 text-[10px] font-mono">{t('profileEditor.deactiveMs')}</label>
                  <input type="number" className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs font-mono text-gray-200 w-full"
                    value={cfg['deactivateAtMs'] ?? 5000}
                    onChange={(e) => updateBit(idx, { behaviorConfig: { ...cfg, deactivateAtMs: Number(e.target.value) } as FlagBit['behaviorConfig'] })}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

function ComputedEditor({ config, onChange, allFields }: {
  config: ComputedConfig;
  onChange: (p: Partial<ComputedConfig>) => void;
  allFields: Field[];
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div>
        <label className={labelCls}>{t('profileEditor.expression')}</label>
        <textarea
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200 outline-none focus:border-green-700 w-full h-20 resize-none"
          value={config.expression}
          onChange={(e) => onChange({ expression: e.target.value })}
          placeholder="fields['Alan1'] * 2 + 10"
        />
        <div className="text-gray-600 text-[10px] mt-1 font-mono">
          {t('profileEditor.availableFields')}: {allFields.filter((f) => f.type !== 'computed').map((f) => `fields['${f.name}']`).join(', ')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>{t('profileEditor.minClamp')}</label>
          <input type="number" className={inputCls} value={config.clampMin} onChange={(e) => onChange({ clampMin: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>{t('profileEditor.maxClamp')}</label>
          <input type="number" className={inputCls} value={config.clampMax} onChange={(e) => onChange({ clampMax: Number(e.target.value) })} />
        </div>
      </div>
    </div>
  );
}
function ScriptEditor({ config, onChange }: { config: ScriptConfig; onChange: (p: Partial<ScriptConfig>) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <label className={labelCls}>{t('profileEditor.jsCode')}</label>
      <div className="relative group">
        <textarea
          className="bg-gray-950 border border-gray-800 rounded p-3 text-[11px] font-mono text-blue-300 outline-none focus:border-blue-600 w-full h-48 resize-none leading-relaxed"
          value={config.code}
          onChange={(e) => onChange({ code: e.target.value })}
          spellCheck={false}
          placeholder="// t: ms, i: frame, f: fields"
        />
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span className="text-[10px] text-gray-600 font-mono">JS / ES6+</span>
        </div>
      </div>
      <div className="bg-blue-900/10 border border-blue-900/30 rounded p-2">
        <div className="text-blue-400 text-[10px] font-mono font-bold mb-1 uppercase tracking-tight">{t('profileEditor.availableVars')}</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <div className="text-gray-500 text-[10px] font-mono truncate"><code className="text-blue-300">t</code> {t('profileEditor.varT')}</div>
          <div className="text-gray-500 text-[10px] font-mono truncate"><code className="text-blue-300">i</code> {t('profileEditor.varI')}</div>
          <div className="text-gray-500 text-[10px] font-mono truncate"><code className="text-blue-300">f</code> {t('profileEditor.varF')}</div>
          <div className="text-gray-500 text-[10px] font-mono truncate"><code className="text-blue-300">Math.*</code> {t('profileEditor.varMath')}</div>
        </div>
      </div>
    </div>
  );
}
