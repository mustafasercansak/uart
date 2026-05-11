import type { DBCDatabase, DBCMessage, DBCSignal } from '../types/protocols/canbus';

/**
 * Parse a DBC file string into a DBCDatabase.
 * Supports: VERSION, NS_, BU_, BO_, SG_, CM_, VAL_ blocks.
 */
export function parseDBCFile(content: string, filename?: string): DBCDatabase {
  const db: DBCDatabase = {
    version: '',
    messages: new Map(),
    nodes: [],
    filename,
  };

  const lines = content.split('\n');
  let i = 0;

  // Merge continuation lines (lines ending with `,` or lines starting with spaces that continue a block)
  const flatLines: string[] = [];
  while (i < lines.length) {
    let line = lines[i].trimEnd();
    // Collect multiline strings (e.g. comments)
    while (line.endsWith(',') && i + 1 < lines.length) {
      i++;
      line = line + ' ' + lines[i].trim();
    }
    flatLines.push(line);
    i++;
  }

  let currentMsg: DBCMessage | null = null;

  for (const rawLine of flatLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    // VERSION
    if (line.startsWith('VERSION')) {
      const m = line.match(/VERSION\s+"([^"]*)"/);
      if (m) db.version = m[1];
      continue;
    }

    // BU_ (node list)
    if (line.startsWith('BU_:')) {
      db.nodes = line.slice(4).trim().split(/\s+/).filter(Boolean);
      continue;
    }

    // BO_ <id> <name>: <dlc> <sender>
    if (line.startsWith('BO_ ')) {
      const m = line.match(/^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(\S+)/);
      if (m) {
        currentMsg = {
          id: parseInt(m[1]),
          name: m[2],
          dlc: parseInt(m[3]),
          sender: m[4],
          signals: [],
        };
        db.messages.set(currentMsg.id, currentMsg);
      }
      continue;
    }

    // SG_ <name> : <startBit>|<bitLen>@<byteOrder><valueType> (<scale>,<offset>) [<min>|<max>] "<unit>" <receivers>
    if (line.startsWith('SG_ ') && currentMsg) {
      const sig = parseSignalLine(line);
      if (sig) currentMsg.signals.push(sig);
      continue;
    }

    // CM_ SG_ <id> <signal> "<comment>"
    if (line.startsWith('CM_ SG_')) {
      const m = line.match(/CM_ SG_\s+(\d+)\s+(\w+)\s+"([^"]*)"/);
      if (m) {
        const msg = db.messages.get(parseInt(m[1]));
        if (msg) {
          const sig = msg.signals.find(s => s.name === m[2]);
          if (sig) sig.comment = m[3];
        }
      }
      continue;
    }

    // CM_ BO_ <id> "<comment>"
    if (line.startsWith('CM_ BO_')) {
      const m = line.match(/CM_ BO_\s+(\d+)\s+"([^"]*)"/);
      if (m) {
        const msg = db.messages.get(parseInt(m[1]));
        if (msg) msg.comment = m[2];
      }
      continue;
    }

    // VAL_ <id> <signal> <val> "<label>" ...
    if (line.startsWith('VAL_')) {
      const m = line.match(/VAL_\s+(\d+)\s+(\w+)\s+(.+)/);
      if (m) {
        const msg = db.messages.get(parseInt(m[1]));
        if (msg) {
          const sig = msg.signals.find(s => s.name === m[2]);
          if (sig) {
            sig.valueTable = parseValueTable(m[3]);
          }
        }
      }
      continue;
    }

    // If we see a blank line or new top-level keyword, reset currentMsg
    if (!line.startsWith(' ') && !line.startsWith('\t') && !line.startsWith('SG_') && currentMsg) {
      currentMsg = null;
    }
  }

  return db;
}

function parseSignalLine(line: string): DBCSignal | null {
  // SG_ Name [M|m<n>] : startBit|bitLen@byteOrder valueType (scale,offset) [min|max] "unit" receivers
  const pattern = /^SG_\s+(\w+)\s+(?:[Mm]\d*\s+)?:\s+(\d+)\|(\d+)@([01])([+-])\s+\(([^,]+),([^)]+)\)\s+\[([^|]+)\|([^\]]+)\]\s+"([^"]*)"\s+(.*)/;
  const m = line.match(pattern);
  if (!m) return null;

  return {
    name: m[1],
    startBit: parseInt(m[2]),
    bitLength: parseInt(m[3]),
    byteOrder: m[4] === '1' ? 'little' : 'big',
    valueType: m[5] === '+' ? 'unsigned' : 'signed',
    scale: parseFloat(m[6]),
    offset: parseFloat(m[7]),
    min: parseFloat(m[8]),
    max: parseFloat(m[9]),
    unit: m[10],
    receivers: m[11].trim().split(/\s*,\s*|\s+/).filter(Boolean),
  };
}

function parseValueTable(str: string): Record<number, string> {
  const table: Record<number, string> = {};
  const pattern = /(\d+)\s+"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(str)) !== null) {
    table[parseInt(m[1])] = m[2];
  }
  return table;
}

/** Generate a minimal sample DBC for demo purposes */
export function generateSampleDBC(): string {
  return `VERSION "1.0"

NS_ :

BU_: ECU TCU BCM ABS

BO_ 256 EngineData: 8 ECU
 SG_ EngineRPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" TCU,BCM
 SG_ EngineTemp : 16|8@1+ (1,-40) [-40|215] "degC" Vector__XXX
 SG_ ThrottlePos : 24|8@1+ (0.392157,0) [0|100] "%" TCU

BO_ 512 TransmissionData: 4 TCU
 SG_ GearPosition : 0|4@1+ (1,0) [0|7] "" ECU
 SG_ VehicleSpeed : 8|16@1+ (0.01,0) [0|655.35] "km/h" ECU,BCM

BO_ 768 BrakeData: 3 ABS
 SG_ BrakePressure : 0|12@1+ (0.1,0) [0|409.5] "bar" ECU
 SG_ ABSActive : 12|1@1+ (1,0) [0|1] "" ECU

BO_ 1024 BodyControl: 2 BCM
 SG_ LightStatus : 0|4@1+ (1,0) [0|15] "" Vector__XXX
 SG_ DoorStatus : 4|4@1+ (1,0) [0|15] "" Vector__XXX

CM_ SG_ 256 EngineRPM "Engine rotational speed";
CM_ SG_ 256 EngineTemp "Coolant temperature";
CM_ SG_ 512 VehicleSpeed "Current vehicle speed";
CM_ SG_ 768 ABSActive "ABS system active flag";

VAL_ 512 GearPosition 0 "Park" 1 "Reverse" 2 "Neutral" 3 "Drive" 4 "Sport" ;
VAL_ 768 ABSActive 0 "Inactive" 1 "Active" ;
`;
}
