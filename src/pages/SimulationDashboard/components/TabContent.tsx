import React from 'react';
import WaveformCharts from './WaveformCharts';
import LogicAnalyzer from './LogicAnalyzer';
import TelemetryPanel from './Telemetry/TelemetryPanel';
import DiffLab from './Lab/DiffLab';
import PlaybackPanel from './PlaybackPanel';
import ScriptEditor from './Lab/ScriptEditor';
import CommunicationTimeline from './CommunicationTimeline';
import Diagnostics from './Diagnostics';
import HardwareLayout from './HardwareLayout';
import SequenceRunner from './SequenceRunner';
import SpectrumAnalyzer from './SpectrumAnalyzer';
import TriggerManager from './TriggerManager';
import MedicalRoomScene from '../../../components/Visualizer/MedicalRoomScene';
import LearningMode from '../../../components/LearningMode/LearningMode';
import ProtocolDecoderPanel from './ProtocolDecoderPanel';
import TestSuiteRunner from './TestSuiteRunner';
import ErrorReportPanel from './ErrorReportPanel';
import FrameBuilder from './FrameBuilder';
import { GeneratedFrame, FrameProfile, SimulationState } from '../../../types';

interface TabContentProps {
  activeTab: string;
  state: SimulationState;
  profiles: FrameProfile[];
  lastFrame: GeneratedFrame | null;
  lastRxFrame: GeneratedFrame | null;
  selectedProfile: FrameProfile | null;
  waveformHistory: Array<Record<string, number>>;
  exchanges: import('../../../types').Exchange[];
  hooks: {
    startPlayback: (data: Array<{ time: number; frame: import('../../../types').GeneratedFrame }>) => void;
    deleteRecording: (id: string) => void;
    refreshRecordings: () => void;
    pausePlayback: () => void;
    resumePlayback: () => void;
    seekPlayback: (index: number) => void;
    stepPlayback: (delta: number) => void;
    setDiffFrame: (index: 0 | 1, frame: GeneratedFrame | null) => void;
    setResponderRules: (rules: import('../../../types').ResponderRule[]) => void;
    setTriggers: (triggers: import('../../../types').Trigger[]) => void;
    onSendFrame?: (bytes: number[]) => void;
  };
  elapsedMs?: number;
  frameCount?: number;
  errorCount?: number;
}

export default function TabContent({
  activeTab,
  state,
  profiles,
  lastFrame,
  lastRxFrame,
  selectedProfile,
  waveformHistory,
  exchanges,
  hooks,
  elapsedMs = 0,
  frameCount: frameCountProp,
  errorCount: errorCountProp,
}: TabContentProps) {
  const { timingStats, frameCount, errorCount, status, recordings, playbackIndex, playbackTotal, responderRules, diffFrames, watchlist, triggers, recentFrames } = state;
  const resolvedFrameCount = frameCountProp ?? frameCount;
  const resolvedErrorCount = errorCountProp ?? errorCount;

  switch (activeTab) {
    case 'waveforms':
      return (
        <WaveformCharts 
          waveformHistory={waveformHistory}
          selectedProfile={selectedProfile}
        />
      );
    case 'logic':
      return <LogicAnalyzer />;
    case 'telemetry':
      return selectedProfile ? (
        <TelemetryPanel 
          lastFrame={lastFrame}
          waveformHistory={waveformHistory}
          fields={selectedProfile.fields}
          profiles={profiles}
        />
      ) : null;
    case 'lab':
      return (
        <DiffLab 
          frameA={diffFrames[0]} 
          frameB={diffFrames[1]} 
          onClear={() => {
              hooks.setDiffFrame(0, null);
              hooks.setDiffFrame(1, null);
          }}
        />
      );
    case 'playback':
      return (
        <PlaybackPanel 
          recordings={recordings}
          onPlay={hooks.startPlayback}
          onDelete={hooks.deleteRecording}
          onRefresh={hooks.refreshRecordings}
          status={status}
          playbackIndex={playbackIndex || 0}
          playbackTotal={playbackTotal || 0}
          onPause={hooks.pausePlayback}
          onResume={hooks.resumePlayback}
          onSeek={hooks.seekPlayback}
          onStep={hooks.stepPlayback}
        />
      );
    case 'scripting':
      return (
        <ScriptEditor 
          initialCode={responderRules?.find(r => r.id === 'dynamic-script')?.script}
          onSave={(code) => {
            const dynamicRule = {
              id: 'dynamic-script',
              name: 'Dynamic JS Responder',
              enabled: true,
              pattern: '01',
              patternType: 'hex' as const,
              actions: [],
              script: code
            };
            const newRules = (responderRules || []).filter(r => r.id !== 'dynamic-script');
            hooks.setResponderRules([...newRules, dynamicRule]);
          }}
        />
      );
    case 'timeline':
      return (
        <CommunicationTimeline
          exchanges={exchanges}
          onSelectFrame={() => {}}
          hasRealDevice={state.serialConnected || state.networkConnected}
        />
      );
    case 'diagnostics':
      return (
        <Diagnostics 
          timingStats={timingStats}
          errorCount={errorCount}
          frameCount={frameCount}
        />
      );
    case 'hardware':
      return (
        <HardwareLayout 
          lastTxFrame={lastFrame}
          lastRxFrame={lastRxFrame}
          protocol={selectedProfile?.name.includes('SPI') ? 'SPI' : selectedProfile?.name.includes('I2C') ? 'I2C' : 'UART'}
        />
      );
    case 'testing':
      return <SequenceRunner />;
    case 'spectrum':
      return (
        <SpectrumAnalyzer 
          waveformHistory={waveformHistory}
          dataKey={watchlist.length > 0 ? watchlist[0] : (lastFrame?.fields[0]?.name || null)}
        />
      );
    case 'triggers':
      return (
        <TriggerManager 
          triggers={triggers}
          onSetTriggers={hooks.setTriggers}
        />
      );
    case 'visualizer':
      return <MedicalRoomScene lastFrame={lastFrame} activeProfileId={selectedProfile?.id ?? null} profiles={profiles} />;
    case 'decoder':
      return (
        <ProtocolDecoderPanel
          frames={recentFrames}
          profile={selectedProfile}
        />
      );
    case 'testsuite':
      return (
        <TestSuiteRunner
          frames={recentFrames}
          profile={selectedProfile}
        />
      );
    case 'report':
      return (
        <ErrorReportPanel
          frames={recentFrames}
          profile={selectedProfile}
          elapsedMs={elapsedMs}
          frameCount={resolvedFrameCount}
          errorCount={resolvedErrorCount}
        />
      );
    case 'builder':
      return (
        <FrameBuilder
          profile={selectedProfile}
          onSendFrame={hooks.onSendFrame ?? (() => {})}
        />
      );
    case 'learn':
      return (
        <LearningMode
          lastFrame={lastFrame}
          activeProfile={selectedProfile}
        />
      );
    default:
      return null;
  }
}
