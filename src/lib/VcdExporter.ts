import type { GeneratedFrame, FrameProfile } from '../types';

export function generateVcd(frames: GeneratedFrame[], profile: FrameProfile): string {
  const baudRate = profile.baudRate || 9600;
  const bitDurationUs = 1000000 / baudRate;
  
  const now = new Date();
  
  let vcd = `$date\n  ${now.toISOString()}\n$end\n`;
  vcd += `$version\n  UART Simulator Pro VCD Exporter\n$end\n`;
  vcd += `$timescale 1us $end\n`;
  vcd += `$scope module UART_TX $end\n`;
  vcd += `$var wire 1 ! tx $end\n`;
  vcd += `$upscope $end\n`;
  vcd += `$enddefinitions $end\n`;
  
  // Initial state: UART IDLE is High (1)
  vcd += `$dumpvars\n1!\n$end\n`;
  
  const dataBits = profile.dataBits || 8;
  const stopBitsLength = profile.stopBits || 1;
  const parity = profile.parity || 'None';
  
  let currentUs = 0;
  let lastState = 1;
  
  const writeState = (state: number, timeUs: number) => {
    if (state !== lastState || timeUs === 0) {
      vcd += `#${Math.round(timeUs)}\n${state}!\n`;
      lastState = state;
    }
  };

  for (const frame of frames) {
    const frameStartUs = frame.timestampMs * 1000;
    if (frameStartUs > currentUs) {
       currentUs = frameStartUs;
    }
    
    for (const byte of frame.rawBytes) {
      // START bit (0)
      writeState(0, currentUs);
      currentUs += bitDurationUs;
      
      // DATA bits (LSB first)
      let parityCount = 0;
      for (let i = 0; i < dataBits; i++) {
        const bit = (byte >> i) & 1;
        parityCount += bit;
        writeState(bit, currentUs);
        currentUs += bitDurationUs;
      }
      
      // PARITY bit
      if (parity !== 'None') {
        let pBit = 0;
        if (parity === 'Even') pBit = parityCount % 2;
        else if (parity === 'Odd') pBit = (parityCount + 1) % 2;
        else if (parity === 'Mark') pBit = 1;
        else if (parity === 'Space') pBit = 0;
        
        writeState(pBit, currentUs);
        currentUs += bitDurationUs;
      }
      
      // STOP bit(s) (1)
      writeState(1, currentUs);
      currentUs += bitDurationUs * stopBitsLength;
    }
  }
  
  // Final idle state
  writeState(1, currentUs + 10);
  
  return vcd;
}

export function downloadVcd(vcdContent: string, filename: string) {
  const blob = new Blob([vcdContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
