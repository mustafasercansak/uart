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
import Visualizer3D from '../../../components/Visualizer/Visualizer3D';
import ProtocolDecoderPanel from './ProtocolDecoderPanel';
import TestSuiteRunner from './TestSuiteRunner';
import ErrorReportPanel from './ErrorReportPanel';
import FrameBuilder from './FrameBuilder';
import { GeneratedFrame, FrameProfile, SimulationState } from '../../../types';

interface TabContentProps {
  activeTab: string;
  state: SimulationState;
  lastFrame: GeneratedFrame | null;
  lastRxFrame: GeneratedFrame | null;
  selectedProfile: FrameProfile | null;
  waveformHistory: any[];
  exchanges: any[];
  hooks: {
    startPlayback: any;
    deleteRecording: any;
    refreshRecordings: any;
    pausePlayback: any;
    resumePlayback: any;
    seekPlayback: any;
    stepPlayback: any;
    setDiffFrame: any;
    setResponderRules: any;
    setTriggers: any;
    onSendFrame?: (bytes: number[]) => void;
  };
  elapsedMs?: number;
  frameCount?: number;
  errorCount?: number;
}

export default function TabContent({
  activeTab,
  state,
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
          chartColors={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316']}
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
          exchanges={exchanges}
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
      return <Visualizer3D lastFrame={lastFrame} />;
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
    default:
      return null;
  }
}
