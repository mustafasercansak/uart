import React, { useState, useMemo } from 'react';
import { GitCompare, CheckCircle, XCircle, Minus } from 'lucide-react';
import type { FrameProfile } from '../../../types';
import type { Field } from '../../../types/field';
import { useTranslation } from '../../../i18n/context';

interface ProfileCompareProps {
  profiles: FrameProfile[];
}

export default function ProfileCompare({ profiles }: ProfileCompareProps) {
  const { t } = useTranslation();
  const [idA, setIdA] = useState<string>(profiles[0]?.id ?? '');
  const [idB, setIdB] = useState<string>(profiles[1]?.id ?? profiles[0]?.id ?? '');

  const profileA = profiles.find(p => p.id === idA) ?? null;
  const profileB = profiles.find(p => p.id === idB) ?? null;

  const allFieldNames = useMemo(() => {
    const names = new Set<string>();
    profileA?.fields.forEach((f: Field) => names.add(f.name));
    profileB?.fields.forEach((f: Field) => names.add(f.name));
    return Array.from(names);
  }, [profileA, profileB]);

  if (profiles.length < 1) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-600 font-mono text-xs">
        <GitCompare size={40} className="mb-3 opacity-30" />
        <p>{t('profileCompare.noProfiles')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-mono text-xs overflow-y-auto custom-scrollbar">
      {/* Header / selector */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-3 border-b border-gray-800/50 bg-gray-900/40 flex-wrap">
        <GitCompare size={14} className="text-indigo-400 shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-300 shrink-0">{t('profileCompare.title')}</span>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-blue-400 uppercase">{t('profileCompare.profileA')}</span>
            <select
              value={idA}
              onChange={e => setIdA(e.target.value)}
              className="bg-gray-900 border border-blue-800/50 text-gray-300 text-[10px] rounded px-2 py-1"
            >
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-emerald-400 uppercase">{t('profileCompare.profileB')}</span>
            <select
              value={idB}
              onChange={e => setIdB(e.target.value)}
              className="bg-gray-900 border border-emerald-800/50 text-gray-300 text-[10px] rounded px-2 py-1"
            >
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      {profileA && profileB && (
        <div className="shrink-0 flex items-center gap-6 px-4 py-2 bg-gray-950/60 border-b border-gray-800/30 text-[9px]">
          <span className="text-gray-600">{t('profileCompare.fieldsA', { count: profileA.fields.length })}</span>
          <span className="text-gray-600">{t('profileCompare.fieldsB', { count: profileB.fields.length })}</span>
          {idA === idB && (
            <span className="text-yellow-500 ml-auto">{t('profileCompare.sameProfile')}</span>
          )}
        </div>
      )}

      {(!profileA || !profileB) ? (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <p>{t('profileCompare.selectTwo')}</p>
        </div>
      ) : (
        <div className="flex-1 p-4 space-y-6">

          {/* Field structure diff */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">{t('profileCompare.structureDiff')}</h3>
            <div className="border border-gray-800/50 rounded-lg overflow-hidden">
              <div className="grid grid-cols-3 bg-gray-900/60 border-b border-gray-800/50 text-[9px] font-bold uppercase tracking-widest text-gray-500 px-3 py-2">
                <span className="text-blue-400">{profileA.name}</span>
                <span className="text-center text-gray-600">{t('profileCompare.field')}</span>
                <span className="text-right text-emerald-400">{profileB.name}</span>
              </div>
              {allFieldNames.map(name => {
                const fA = profileA.fields.find((f: Field) => f.name === name);
                const fB = profileB.fields.find((f: Field) => f.name === name);
                const onlyA = fA && !fB;
                const onlyB = !fA && fB;
                const inBoth = fA && fB;
                const typeDiff = inBoth && fA.type !== fB.type;

                return (
                  <div
                    key={name}
                    className={`grid grid-cols-3 px-3 py-1.5 border-b border-gray-800/30 last:border-0 text-[10px] ${
                      onlyA ? 'bg-blue-950/20' : onlyB ? 'bg-emerald-950/20' : typeDiff ? 'bg-yellow-950/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {fA ? (
                        <span className="text-blue-300/80">{fA.type}</span>
                      ) : (
                        <Minus size={10} className="text-gray-700" />
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      {onlyA && <XCircle size={9} className="text-emerald-700" />}
                      {onlyB && <XCircle size={9} className="text-blue-700" />}
                      {inBoth && !typeDiff && <CheckCircle size={9} className="text-gray-600" />}
                      {typeDiff && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
                      <span className={`font-bold ${onlyA ? 'text-blue-400' : onlyB ? 'text-emerald-400' : typeDiff ? 'text-yellow-300' : 'text-gray-400'}`}>
                        {name}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      {fB ? (
                        <span className="text-emerald-300/80">{fB.type}</span>
                      ) : (
                        <Minus size={10} className="text-gray-700" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Frame size comparison based on field bit widths */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">{t('profileCompare.frameSize')}</h3>
            <div className="flex gap-4">
              {[{ profile: profileA, color: 'blue' }, { profile: profileB, color: 'emerald' }].map(({ profile, color }) => {
                const totalBits = profile.fields.reduce((sum: number, f: Field) => sum + (f.byteWidth * 8), 0);
                const totalBytes = Math.ceil(totalBits / 8);
                return (
                  <div key={profile.id} className={`flex-1 p-3 rounded-lg border border-${color}-800/40 bg-${color}-950/10`}>
                    <div className={`text-[9px] text-${color}-400 mb-2 font-bold`}>{profile.name}</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-2xl font-black font-mono text-${color}-300`}>{totalBytes}</span>
                      <span className="text-[10px] text-gray-500">bytes ({totalBits} bits)</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {profile.fields.map((f: Field) => (
                        <span key={f.id} className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-500" title={`${f.byteWidth * 8} bits`}>
                          {f.name}:{f.byteWidth * 8}b
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
