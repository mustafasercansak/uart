import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ─────────────────────────────────────────────
   UART SENSÖR TEST SİMÜLATÖRÜ
   Bit-level frame animasyonu, hata enjeksiyonu,
   baud rate karşılaştırma, canlı osiloskop
   ───────────────────────────────────────────── */

// ── Sensör Registry (Genişletilebilir) ──────
const SENSOR_REGISTRY = {
  DS18B20: {
    name: "DS18B20",
    label: "Sıcaklık",
    unit: "°C",
    icon: "🌡",
    min: -55, max: 125, resolution: 0.0625,
    color: "#ff6b6b",
    generate: (t) => 22 + 8 * Math.sin(t * 0.3) + (Math.random() - 0.5) * 1.5,
    encodeBytes: (val) => {
      const raw = Math.round(val / 0.0625);
      return [(raw >> 8) & 0xff, raw & 0xff];
    },
  },
  DHT22: {
    name: "DHT22",
    label: "Nem",
    unit: "%RH",
    icon: "💧",
    min: 0, max: 100, resolution: 0.1,
    color: "#4ecdc4",
    generate: (t) => 55 + 20 * Math.sin(t * 0.15 + 1) + (Math.random() - 0.5) * 3,
    encodeBytes: (val) => {
      const raw = Math.round(val * 10);
      return [(raw >> 8) & 0xff, raw & 0xff];
    },
  },
  BMP280: {
    name: "BMP280",
    label: "Basınç",
    unit: "hPa",
    icon: "🔵",
    min: 300, max: 1100, resolution: 0.01,
    color: "#a29bfe",
    generate: (t) => 1013.25 + 15 * Math.sin(t * 0.08 + 2) + (Math.random() - 0.5) * 2,
    encodeBytes: (val) => {
      const raw = Math.round(val * 100);
      return [(raw >> 16) & 0xff, (raw >> 8) & 0xff, raw & 0xff];
    },
  },
  MPU6050: {
    name: "MPU6050",
    label: "İvme X",
    unit: "g",
    icon: "📐",
    min: -16, max: 16, resolution: 0.001,
    color: "#fdcb6e",
    generate: (t) => 0.02 + 2.5 * Math.sin(t * 0.5 + 3) + (Math.random() - 0.5) * 0.3,
    encodeBytes: (val) => {
      const raw = Math.round(val * 16384) & 0xffff;
      return [(raw >> 8) & 0xff, raw & 0xff];
    },
  },

  // ── Sağlık Sensörleri ─────────────────────
  AD8232: {
    name: "AD8232",
    label: "EKG",
    unit: "mV",
    icon: "💓",
    min: -2, max: 2, resolution: 0.001,
    color: "#ff4d6d",
    generate: (t) => {
      // PQRST kompleksi yaklaşımı (60 bpm = ~1Hz)
      const hz = 1.1;
      const c = (t * hz) % (2 * Math.PI);
      const P =  0.18 * Math.exp(-Math.pow(c - 0.8,  2) / 0.04);
      const Q = -0.12 * Math.exp(-Math.pow(c - 1.20, 2) / 0.006);
      const R =  1.60 * Math.exp(-Math.pow(c - 1.35, 2) / 0.003);
      const S = -0.28 * Math.exp(-Math.pow(c - 1.50, 2) / 0.006);
      const T =  0.30 * Math.exp(-Math.pow(c - 2.10, 2) / 0.07);
      return P + Q + R + S + T + (Math.random() - 0.5) * 0.025;
    },
    encodeBytes: (val) => {
      // 12-bit ADC, merkez = 2048
      const raw = Math.max(0, Math.min(4095, Math.round(val * 600 + 2048)));
      return [(raw >> 8) & 0xff, raw & 0xff];
    },
  },

  MAX30102_SPO2: {
    name: "MAX30102_SPO2",
    label: "SpO₂",
    unit: "%",
    icon: "🫁",
    min: 85, max: 100, resolution: 0.1,
    color: "#e84393",
    generate: (t) => 97.8 + 1.2 * Math.sin(t * 0.04) + (Math.random() - 0.5) * 0.3,
    encodeBytes: (val) => {
      const raw = Math.round(val * 10); // 978 → 97.8%
      return [(raw >> 8) & 0xff, raw & 0xff];
    },
  },

  MAX30102_HR: {
    name: "MAX30102_HR",
    label: "Nabız",
    unit: "bpm",
    icon: "❤️",
    min: 40, max: 200, resolution: 1,
    color: "#ff6b9d",
    generate: (t) => 72 + 8 * Math.sin(t * 0.08) + (Math.random() - 0.5) * 2,
    encodeBytes: (val) => [Math.round(val) & 0xff],
  },

  MLX90614: {
    name: "MLX90614",
    label: "Vücut Sıcaklığı",
    unit: "°C",
    icon: "🌡",
    min: 34, max: 42, resolution: 0.02,
    color: "#ff8c42",
    generate: (t) => 36.8 + 0.4 * Math.sin(t * 0.03) + (Math.random() - 0.5) * 0.08,
    encodeBytes: (val) => {
      // MLX90614: değer * 50 (0.02°C çözünürlük)
      const raw = Math.round(val * 50);
      return [(raw >> 8) & 0xff, raw & 0xff];
    },
  },

  GSR: {
    name: "GSR",
    label: "GSR (Stres)",
    unit: "kΩ",
    icon: "🧠",
    min: 1, max: 500, resolution: 0.1,
    color: "#c77dff",
    generate: (t) => 80 + 60 * Math.sin(t * 0.06 + 1) + (Math.random() - 0.5) * 8,
    encodeBytes: (val) => {
      const raw = Math.round(val * 10);
      return [(raw >> 8) & 0xff, raw & 0xff];
    },
  },

  // ── Masimo SET Sensörleri ─────────────────
  MASIMO_SPO2: {
    name: "MASIMO_SPO2",
    label: "Masimo SpO₂",
    unit: "%",
    icon: "🩸",
    min: 80, max: 100, resolution: 0.1,
    color: "#ff3f34",
    generate: (t) => 98.2 + 0.8 * Math.sin(t * 0.03) + (Math.random() - 0.5) * 0.2,
    encodeBytes: (val) => {
      const raw = Math.round(val * 10);
      return [(raw >> 8) & 0xff, raw & 0xff];
    },
  },
  MASIMO_PR: {
    name: "MASIMO_PR",
    label: "Masimo PR",
    unit: "bpm",
    icon: "🫀",
    min: 30, max: 240, resolution: 1,
    color: "#ff5e57",
    generate: (t) => 75 + 5 * Math.sin(t * 0.05) + (Math.random() - 0.5) * 1.5,
    encodeBytes: (val) => {
      const raw = Math.round(val);
      return [(raw >> 8) & 0xff, raw & 0xff];
    },
  },
  MASIMO_PI: {
    name: "MASIMO_PI",
    label: "Masimo PI",
    unit: "%",
    icon: "🌊",
    min: 0.02, max: 20, resolution: 0.01,
    color: "#0be881",
    generate: (t) => 2.5 + 0.5 * Math.sin(t * 0.1) + (Math.random() - 0.5) * 0.1,
    encodeBytes: (val) => {
      const raw = Math.round(val * 100);
      return [(raw >> 8) & 0xff, raw & 0xff];
    },
  },
};

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

const PARITY_MODES = {
  none: { label: "Yok", calc: () => null },
  even: { label: "Çift", calc: (bits) => bits.reduce((a, b) => a ^ b, 0) },
  odd: { label: "Tek", calc: (bits) => bits.reduce((a, b) => a ^ b, 0) ^ 1 },
};

const toHex = (data) => {
  if (!data) return "";
  const arr = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
};

// ── Protocol Registry ────────────────────────
// Her protokol: { label, example, color, parse(line)→{key,value}|null }
// Binary ayrıca parsePacket(Uint8Array[5])→{key,value}|null içerir
const PROTOCOLS = {
  ascii: {
    label: "ASCII",
    example: "DS18B20:23.450",
    color: "#00ff88",
    parse: (line) => {
      const m = line.trim().match(/^([A-Za-z0-9_]+):\s*(-?[\d.]+)/);
      return m ? { key: m[1].toUpperCase(), value: parseFloat(m[2]) } : null;
    },
  },
  json: {
    label: "JSON",
    example: '{"s":"DS18B20","v":23.45}',
    color: "#ffd93d",
    parse: (line) => {
      try {
        const o = JSON.parse(line.trim());
        const key = (o.sensor || o.s || o.name || o.key || "").toUpperCase();
        const val = o.value ?? o.v ?? o.val;
        return key && val !== undefined ? { key, value: parseFloat(val) } : null;
      } catch { return null; }
    },
  },
  binary: {
    label: "Binary",
    example: "0xAA 0x00 0x0E 0xD0 0xXX",
    color: "#a29bfe",
    parse: null, // satır tabanlı değil, packet tabanlı
    parsePacket: (buf) => {
      // [0xAA][sensor_id:1][val_hi:1][val_lo:1][xor_checksum:1]
      if (buf.length < 5 || buf[0] !== 0xAA) return null;
      const xor = buf[0] ^ buf[1] ^ buf[2] ^ buf[3];
      if (xor !== buf[4]) return null;
      const BINARY_MAP = {
        0x00: { key: "DS18B20",       scale: 0.0625   },
        0x01: { key: "DHT22",         scale: 0.1       },
        0x02: { key: "BMP280",        scale: 0.01      },
        0x03: { key: "MPU6050",       scale: 1 / 16384 },
        // Sağlık sensörleri
        0x10: { key: "AD8232",        scale: 1 / 600   }, // (raw - 2048) / 600 mV
        0x11: { key: "MAX30102_SPO2", scale: 0.1       }, // raw * 0.1 = %
        0x12: { key: "MAX30102_HR",   scale: 1         }, // raw = bpm
        0x13: { key: "MLX90614",      scale: 0.02      }, // raw * 0.02 = °C
        0x14: { key: "GSR",           scale: 0.1       }, // raw * 0.1 = kΩ
        // Masimo
        0x20: { key: "MASIMO_SPO2",   scale: 0.1       }, // raw * 0.1 = %
        0x21: { key: "MASIMO_PR",     scale: 1         }, // raw = bpm
        0x22: { key: "MASIMO_PI",     scale: 0.01      }, // raw * 0.01 = %
      };
      const raw = (buf[2] << 8) | buf[3];
      const entry = BINARY_MAP[buf[1]];
      return entry
        ? { key: entry.key, value: raw * entry.scale }
        : { key: `SENSOR_${buf[1].toString(16).toUpperCase().padStart(2, "0")}`, value: raw };
    },
  },
  slcan: {
    label: "CAN (SLCAN)",
    example: "t12381122334455667788",
    color: "#ff7675",
    parse: (line) => {
      const match = line.trim().match(/^t([0-9A-Fa-f]{3})([0-8])(.*)/);
      if (!match) return null;
      const id = parseInt(match[1], 16);
      const dataHex = match[3];
      
      if (id === 0x011 && dataHex.length >= 2) {
        return { key: "MASIMO_SPO2", value: parseInt(dataHex.slice(0,2), 16) };
      }
      if (id === 0x012 && dataHex.length >= 2) {
        return { key: "MASIMO_PR", value: parseInt(dataHex.slice(0,2), 16) };
      }
      
      const val = dataHex.length >= 4 ? parseInt(dataHex.slice(0,4), 16) :
                  dataHex.length >= 2 ? parseInt(dataHex.slice(0,2), 16) : 0;
      
      return { key: `CAN_0x${match[1].toUpperCase()}`, value: val };
    },
  },
};

// ── Firmware Examples ────────────────────────
const FIRMWARE_EXAMPLES = {
  arduino_ascii: {
    label: "Arduino / ESP32 / ESP8266 — ASCII",
    code: `// Protokol: ASCII  →  "SENSOR:DEĞER\\n"
// Baud rate'i simülatördeki ile eşleştir

#include <Arduino.h>

void setup() {
  Serial.begin(9600);
}

void loop() {
  // Gerçek sensör okumalarını buraya koy:
  float temp = 22.5 + random(-10, 10) * 0.1f;
  float hum  = 55.0 + random(-5,  5)  * 0.1f;

  Serial.print("DS18B20:");
  Serial.println(temp, 3);   // → "DS18B20:22.500\\n"

  Serial.print("DHT22:");
  Serial.println(hum, 1);    // → "DHT22:55.0\\n"

  delay(1000);
}`,
  },
  arduino_json: {
    label: "Arduino / ESP32 / ESP8266 — JSON",
    code: `// Protokol: JSON  →  {"s":"SENSOR","v":DEĞER}\\n

#include <Arduino.h>

void sendJSON(const char* sensor, float value) {
  Serial.print("{\\"s\\":\\"");
  Serial.print(sensor);
  Serial.print("\\",\\"v\\":");
  Serial.print(value, 3);
  Serial.println("}");
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  float temp = 22.5 + random(-10, 10) * 0.1f;
  float hum  = 55.0 + random(-5,  5)  * 0.1f;

  sendJSON("DS18B20", temp);  // → {"s":"DS18B20","v":22.500}
  sendJSON("DHT22",   hum);   // → {"s":"DHT22","v":55.000}

  delay(1000);
}`,
  },
  arduino_binary: {
    label: "Arduino / ESP32 / ESP8266 — Binary",
    code: `// Protokol: Binary
// Paket: [0xAA][SENSOR_ID][VAL_HI][VAL_LO][XOR]
// ID: 0x00=DS18B20  0x01=DHT22  0x02=BMP280  0x03=MPU6050

#include <Arduino.h>

void sendBinary(uint8_t sensorId, int16_t rawValue) {
  uint8_t hi  = (rawValue >> 8) & 0xFF;
  uint8_t lo  = rawValue & 0xFF;
  uint8_t xor = 0xAA ^ sensorId ^ hi ^ lo;
  uint8_t pkt[5] = { 0xAA, sensorId, hi, lo, xor };
  Serial.write(pkt, 5);
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  float temp = 22.5f;
  sendBinary(0x00, (int16_t)(temp / 0.0625f));   // DS18B20

  float hum = 55.0f;
  sendBinary(0x01, (int16_t)(hum / 0.1f));        // DHT22

  float press = 1013.25f;
  sendBinary(0x02, (int16_t)(press / 0.01f));     // BMP280

  delay(1000);
}`,
  },
  stm32_ascii: {
    label: "STM32 HAL — ASCII",
    code: `// Protokol: ASCII — STM32 HAL UART
// CubeMX: USART1/USART2 baud = 9600

#include "main.h"
#include <stdio.h>
#include <string.h>

extern UART_HandleTypeDef huart1;

void sendSensorASCII(const char *name, float value) {
  char buf[64];
  int  len = snprintf(buf, sizeof(buf), "%s:%.3f\\r\\n", name, value);
  HAL_UART_Transmit(&huart1, (uint8_t *)buf, len, 100);
}

// while(1) döngüsünde:
void sensorLoop(void) {
  float temp  = 22.5f;   // I2C / ADC okuma
  float press = 1013.25f;

  sendSensorASCII("DS18B20", temp);    // → "DS18B20:22.500\\r\\n"
  sendSensorASCII("BMP280",  press);   // → "BMP280:1013.250\\r\\n"

  HAL_Delay(1000);
}`,
  },
  stm32_binary: {
    label: "STM32 HAL — Binary",
    code: `// Protokol: Binary — STM32 HAL UART
// Paket: [0xAA][SENSOR_ID][VAL_HI][VAL_LO][XOR]

#include "main.h"

extern UART_HandleTypeDef huart1;

void sendBinary(uint8_t sensorId, int16_t rawValue) {
  uint8_t hi  = (rawValue >> 8) & 0xFF;
  uint8_t lo  = rawValue & 0xFF;
  uint8_t pkt[5] = {
    0xAA, sensorId, hi, lo,
    (uint8_t)(0xAA ^ sensorId ^ hi ^ lo)
  };
  HAL_UART_Transmit(&huart1, pkt, 5, 100);
}

void sensorLoop(void) {
  sendBinary(0x00, (int16_t)(22.5f   / 0.0625f)); // DS18B20
  sendBinary(0x01, (int16_t)(55.0f   / 0.1f));    // DHT22
  sendBinary(0x02, (int16_t)(1013.25f/ 0.01f));   // BMP280

  HAL_Delay(1000);
}`,
  },
};

// ── UART Frame Builder ──────────────────────
function buildUartFrame(byte, parity = "none", stopBits = 1, injectError = null) {
  const dataBits = [];
  for (let i = 0; i < 8; i++) dataBits.push((byte >> i) & 1);

  let parityBit = PARITY_MODES[parity].calc(dataBits);
  let framingOk = true;

  const bits = [0, ...dataBits]; // start bit = 0

  if (parityBit !== null) {
    let pb = parityBit;
    if (injectError === "parity") pb ^= 1;
    bits.push(pb);
  }

  for (let i = 0; i < stopBits; i++) {
    bits.push(injectError === "framing" && i === 0 ? 0 : 1);
  }
  if (injectError === "framing") framingOk = false;

  return {
    bits,
    byte,
    parity,
    parityBit,
    framingOk,
    hasError: injectError !== null,
    errorType: injectError,
    labels: [
      "START",
      ...dataBits.map((_, i) => `D${i}`),
      ...(parityBit !== null ? ["PAR"] : []),
      ...Array(stopBits).fill("STOP"),
    ],
  };
}

// ── Oscilloscope Canvas ─────────────────────
function Oscilloscope({ frames, baudRate, width = 700, height = 180, playing, activeFrame, activeBit }) {
  const canvasRef = useRef(null);
  const glowRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const glow = glowRef.current;
    if (!canvas || !glow) return;
    const ctx = canvas.getContext("2d");
    const gctx = glow.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    glow.width = width * dpr;
    glow.height = height * dpr;
    ctx.scale(dpr, dpr);
    gctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, width, height);
    gctx.clearRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = "#1a2332";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = "#1e3a2a";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();

    // All bits from all frames
    const allBits = frames.flatMap((f) => f.bits);
    if (allBits.length === 0) return;

    const bitWidth = Math.min(width / allBits.length, 50);
    const high = height * 0.2;
    const low = height * 0.8;
    const margin = (width - bitWidth * allBits.length) / 2;

    let globalIdx = 0;
    frames.forEach((frame, fi) => {
      frame.bits.forEach((bit, bi) => {
        const x = margin + globalIdx * bitWidth;
        const y = bit === 1 ? high : low;
        const nextBit = globalIdx < allBits.length - 1 ? allBits[globalIdx + 1] : bit;
        const nextY = nextBit === 1 ? high : low;

        const isActive = fi === activeFrame && bi === activeBit;
        const isPast = fi < activeFrame || (fi === activeFrame && bi < activeBit);
        const alpha = playing ? (isPast || isActive ? 1 : 0.2) : 0.8;
        const isErrorBit = frame.hasError && (
          (frame.errorType === "parity" && frame.labels[bi] === "PAR") ||
          (frame.errorType === "framing" && frame.labels[bi] === "STOP")
        );

        // Signal line
        ctx.strokeStyle = isErrorBit
          ? `rgba(255, 71, 87, ${alpha})`
          : frame.hasError
            ? `rgba(255, 150, 50, ${alpha})`
            : `rgba(0, 255, 136, ${alpha})`;
        ctx.lineWidth = isActive ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + bitWidth, y);
        if (y !== nextY && globalIdx < allBits.length - 1) {
          ctx.lineTo(x + bitWidth, nextY);
        }
        ctx.stroke();

        // Glow for active bit
        if (isActive && playing) {
          gctx.shadowColor = isErrorBit ? "#ff4757" : frame.hasError ? "#ff9626" : "#00ff88";
          gctx.shadowBlur = 20;
          gctx.strokeStyle = frame.hasError ? "#ff4757" : "#00ff88";
          gctx.lineWidth = 4;
          gctx.beginPath();
          gctx.moveTo(x, y);
          gctx.lineTo(x + bitWidth, y);
          gctx.stroke();
          gctx.shadowBlur = 0;
        }

        // Bit labels
        if (bitWidth > 12) {
          ctx.fillStyle = isActive
            ? "#ffffff"
            : `rgba(120, 180, 150, ${alpha})`;
          ctx.font = `${Math.min(10, bitWidth * 0.35)}px "IBM Plex Mono", monospace`;
          ctx.textAlign = "center";
          ctx.fillText(frame.labels[bi], x + bitWidth / 2, y - 10);
          ctx.fillText(bit.toString(), x + bitWidth / 2, y + (bit === 1 ? 20 : -5));
        }

        globalIdx++;
      });
    });

    // Timing info
    const bitDuration = (1 / baudRate) * 1e6;
    ctx.fillStyle = "#4a6a5a";
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = "left";
    ctx.fillText(`1 bit = ${bitDuration.toFixed(1)} µs  |  Baud: ${baudRate}`, 8, height - 8);
  }, [frames, baudRate, width, height, playing, activeFrame, activeBit]);

  return (
    <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid #1a2a22" }}>
      <canvas ref={canvasRef} style={{ width, height, display: "block", maxWidth: "100%" }} />
      <canvas
        ref={glowRef}
        style={{ width, height, position: "absolute", top: 0, left: 0, pointerEvents: "none", maxWidth: "100%" }}
      />
    </div>
  );
}

// ── Sensor Graph ────────────────────────────
function SensorGraph({ history, sensor, width = 300, height = 100 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = "#141e28";
    ctx.lineWidth = 0.5;
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    if (history.length < 2) return;

    const range = sensor.max - sensor.min;
    const pad = 10;

    const points = history.map((val, i) => ({
      x: (i / (history.length - 1)) * width,
      y: pad + ((sensor.max - val) / range) * (height - 2 * pad),
    }));

    // Gradient fill under the line
    const gradient = ctx.createLinearGradient(0, pad, 0, height - pad);
    gradient.addColorStop(0, `${sensor.color}55`);
    gradient.addColorStop(1, `${sensor.color}00`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    points.forEach(({ x, y }, i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(points[points.length - 1].x, height - pad);
    ctx.lineTo(points[0].x, height - pad);
    ctx.closePath();
    ctx.fill();

    // Line stroke on top
    ctx.strokeStyle = sensor.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = sensor.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    points.forEach(({ x, y }, i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Current value
    const last = history[history.length - 1];
    ctx.fillStyle = sensor.color;
    ctx.font = 'bold 13px "IBM Plex Mono", monospace';
    ctx.textAlign = "right";
    ctx.fillText(`${last.toFixed(2)} ${sensor.unit}`, width - 6, 18);
  }, [history, sensor, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: "block", borderRadius: 6, border: `1px solid ${sensor.color}33` }}
    />
  );
}

function BitFrameDisplay({ frame, activeBit, playing, onBitToggle }) {
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
      {frame.bits.map((bit, i) => {
        const label = frame.labels[i];
        const isActive = playing && i === activeBit;
        const isError =
          (frame.errorType === "parity" && label === "PAR") ||
          (frame.errorType === "framing" && label === "STOP");
        const isData = label.startsWith("D");

        let bg = bit === 1 ? "#1a3a2a" : "#1a1a22";
        let border = bit === 1 ? "#00ff8844" : "#4466ff22";
        let fg = bit === 1 ? "#00ff88" : "#4a6a5a";

        if (isActive) { bg = "#2a4a3a"; border = "#00ff88"; fg = "#fff"; }
        if (isError)  { bg = "#3a1a1a"; border = "#ff4757"; fg = "#ff4757"; }

        return (
          <div
            key={i}
            onClick={() => onBitToggle && isData && onBitToggle(parseInt(label.slice(1)))}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              padding: "6px 8px", background: bg, border: `1px solid ${border}`,
              borderRadius: 6, minWidth: 36, transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: isActive ? "scale(1.1)" : "scale(1)",
              cursor: onBitToggle && isData ? "pointer" : "default",
              boxShadow: isActive ? "0 0 15px rgba(0,255,136,0.2)" : "none",
            }}
          >
            <span style={{ fontSize: 9, color: "#3a5a4a", fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600 }}>
              {label}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: fg, fontFamily: '"IBM Plex Mono", monospace' }}>
              {bit}
            </span>
          </div>
        );
      })}
      <span style={{ fontSize: 12, color: "#4a6a5a", marginLeft: 12, fontWeight: 700 }}>
        0x{frame.byte.toString(16).toUpperCase().padStart(2, "0")}
      </span>
      {frame.hasError && (
        <span style={{ fontSize: 10, color: "#ff4757", marginLeft: 8, padding: "3px 8px", background: "#3a1a1a", borderRadius: 4, fontWeight: 700 }}>
           {frame.errorType.toUpperCase()} ERROR
        </span>
      )}
    </div>
  );
}

// ── Baud Rate Comparison ────────────────────
function BaudRateComparison({ byte, parity, width = 680 }) {
  const canvasRef = useRef(null);
  const w = width, h = 200;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, w, h);

    const frame = buildUartFrame(byte, parity);
    const rates = [9600, 57600, 115200];
    const colors = ["#ff6b6b", "#ffd93d", "#00ff88"];
    const rowH = h / rates.length;

    rates.forEach((rate, ri) => {
      const y0 = ri * rowH;
      const bitDur = 1 / rate;
      const totalTime = frame.bits.length * bitDur;
      const scale = (w - 120) / totalTime;

      ctx.fillStyle = "#4a6a5a";
      ctx.font = '11px "IBM Plex Mono", monospace';
      ctx.textAlign = "left";
      ctx.fillText(`${rate} baud`, 4, y0 + rowH / 2 + 4);

      const high = y0 + rowH * 0.25;
      const low = y0 + rowH * 0.75;

      ctx.strokeStyle = colors[ri];
      ctx.lineWidth = 2;
      ctx.shadowColor = colors[ri];
      ctx.shadowBlur = 4;
      ctx.beginPath();

      frame.bits.forEach((bit, bi) => {
        const x = 100 + bi * bitDur * scale;
        const xEnd = 100 + (bi + 1) * bitDur * scale;
        const yy = bit === 1 ? high : low;
        if (bi === 0) ctx.moveTo(x, yy);
        else {
          const prevY = frame.bits[bi - 1] === 1 ? high : low;
          if (prevY !== yy) ctx.lineTo(x, yy);
        }
        ctx.lineTo(xEnd, yy);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

      const dur = (totalTime * 1e6).toFixed(1);
      ctx.fillStyle = colors[ri];
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = "right";
      ctx.fillText(`${dur} µs`, w - 6, y0 + rowH / 2 + 4);

      if (ri < rates.length - 1) {
        ctx.strokeStyle = "#1a2a22";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y0 + rowH);
        ctx.lineTo(w, y0 + rowH);
        ctx.stroke();
      }
    });
  }, [byte, parity]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: w, height: h, display: "block", borderRadius: 8, border: "1px solid #1a2a22", maxWidth: "100%" }}
    />
  );
}

function SensorLibraryModal({ onAdd, onClose, font }) {
  const [activeTab, setActiveTab] = useState("all"); 
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({ name: "", label: "", unit: "", icon: "📟", min: 0, max: 100, color: "#00ff88" });

  const categories = {
    "all": { label: "Tüm Sensörler", keys: Object.keys(SENSOR_REGISTRY) },
    "health": { label: "Sağlık", keys: ["MASIMO_SPO2", "MASIMO_PR", "MASIMO_PI", "AD8232", "MAX30102_SPO2", "MAX30102_HR", "MLX90614", "GSR"] },
    "env": { label: "Çevresel", keys: ["DS18B20", "DHT22", "BMP280", "MPU6050"] }
  };

  const filteredKeys = categories[activeTab].keys.filter(k => {
    const s = SENSOR_REGISTRY[k];
    return s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
           s.label.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleLibAdd = (key) => {
    onAdd({ ...SENSOR_REGISTRY[key] }, true);
    onClose();
  };

  const handleCustomSubmit = () => {
    if (!form.name || !form.label) return;
    onAdd({
      ...form,
      min: Number(form.min), max: Number(form.max), resolution: 0.01,
      generate: (t) => {
        const mid = (Number(form.max) + Number(form.min)) / 2;
        const amp = (Number(form.max) - Number(form.min)) * 0.3;
        return mid + amp * Math.sin(t * 0.2) + (Math.random() - 0.5) * amp * 0.1;
      },
      encodeBytes: (val) => {
        const raw = Math.round(val * 100);
        return [(raw >> 8) & 0xff, raw & 0xff];
      }
    }, false);
    onClose();
  };

  const modalStyle = {
    position: "fixed", inset: 0, background: "rgba(2, 6, 12, 0.9)",
    backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000
  };

  const cardStyle = {
    background: "#0a121d", border: "1px solid #1a3a3a", borderRadius: 20,
    width: 650, height: "700px", maxWidth: "90vw", display: "flex", flexDirection: "column",
    boxShadow: "0 0 50px rgba(0,255,136,0.1)", overflow: "hidden", position: "relative"
  };

  return (
    <div style={modalStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        {/* Sticky Header Section */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#0a121d" }}>
          {/* Modal Header */}
          <div style={{ padding: "24px 32px", background: "rgba(0,255,136,0.03)", borderBottom: "1px solid #1a3a3a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, color: "#00ff88", letterSpacing: 1, fontWeight: 800 }}>SENSOR HUB</h2>
              <div style={{ fontSize: 11, color: "#4a6a5a", marginTop: 4 }}>PROFESYONEL SİMÜLASYON KÜTÜPHANESİ</div>
            </div>
            <button onClick={onClose} style={{ background: "#1a2a3a", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>

          {/* Modal Toolbar */}
          <div style={{ padding: "16px 32px", background: "#0d1624", borderBottom: "1px solid #1a3a3a", display: "flex", gap: 20, alignItems: "center" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#3a5a4a" }}>🔍</span>
              <input 
                placeholder="Sensör ara..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: "100%", background: "#060a11", border: "1px solid #1a3a3a", padding: "10px 10px 10px 40px", borderRadius: 8, color: "#fff", fontFamily: font, fontSize: 13, outline: "none" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(categories).map(([key, cat]) => (
                <button key={key} onClick={() => setActiveTab(key)} style={{
                  padding: "8px 14px", borderRadius: 6, border: "none",
                  background: activeTab === key ? "#00ff8822" : "transparent",
                  color: activeTab === key ? "#00ff88" : "#4a6a5a",
                  cursor: "pointer", fontSize: 12, fontWeight: 700, transition: "all 0.2s"
                }}>{cat.label}</button>
              ))}
              <button onClick={() => setActiveTab("custom")} style={{
                 padding: "8px 14px", borderRadius: 6, border: "1px dashed #1a3a3a",
                 background: activeTab === "custom" ? "#ff475711" : "transparent",
                 color: activeTab === "custom" ? "#ff4757" : "#4a6a5a",
                 cursor: "pointer", fontSize: 12, fontWeight: 700
              }}>+ ÖZEL</button>
            </div>
          </div>
        </div>

        {/* Modal Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
          {activeTab === "custom" ? (
             <div style={{ maxWidth: 400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 700, textAlign: "center", marginBottom: 10 }}>ÖZEL SENSÖR PARAMETRELERİ</div>
                {[{ k: "name", l: "Sensör Kodu (ID)", p: "Örn: DHT22" }, { k: "label", l: "Etiket", p: "Örn: Nem Sensörü" }, { k: "unit", l: "Birim", p: "Örn: %RH" }, { k: "icon", l: "İkon", p: "📟" }].map(f => (
                  <div key={f.k}>
                    <label style={{ fontSize: 11, color: "#5a7a6a", display: "block", marginBottom: 6 }}>{f.l}</label>
                    <input placeholder={f.p} style={{ width: "100%", background: "#060a11", border: "1px solid #1a3a3a", padding: 12, borderRadius: 8, color: "#fff", fontFamily: font }} value={form[f.k]} onChange={e => setForm({...form, [f.k]: e.target.value})} />
                  </div>
                ))}
                <div style={{ display: "flex", gap: 12 }}>
                   <div style={{ flex: 1 }}><label style={{ fontSize: 11, color: "#5a7a6a" }}>Min</label><input type="number" style={{ width: "100%", background: "#060a11", border: "1px solid #1a3a3a", padding: 10, borderRadius: 8, color: "#fff" }} value={form.min} onChange={e => setForm({...form, min: e.target.value})} /></div>
                   <div style={{ flex: 1 }}><label style={{ fontSize: 11, color: "#5a7a6a" }}>Max</label><input type="number" style={{ width: "100%", background: "#060a11", border: "1px solid #1a3a3a", padding: 10, borderRadius: 8, color: "#fff" }} value={form.max} onChange={e => setForm({...form, max: e.target.value})} /></div>
                   <div style={{ flex: 1 }}><label style={{ fontSize: 11, color: "#5a7a6a" }}>Renk</label><input type="color" style={{ width: "100%", height: 38, background: "none", border: "none", cursor: "pointer" }} value={form.color} onChange={e => setForm({...form, color: e.target.value})} /></div>
                </div>
                <button onClick={handleCustomSubmit} style={{ marginTop: 12, padding: 14, background: "linear-gradient(135deg, #00ff88, #00cc6a)", border: "none", borderRadius: 10, color: "#000", fontWeight: 800, cursor: "pointer", fontFamily: font, boxShadow: "0 10px 20px rgba(0,255,136,0.2)" }}>SENSÖRÜ OLUŞTUR VE EKLE</button>
             </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {filteredKeys.length === 0 ? (
                <div style={{ gridColumn: "1/-1", padding: 40, textAlign: "center", color: "#2a3a32" }}>Arama kriterlerine uygun sensör bulunamadı.</div>
              ) : (
                filteredKeys.map(k => {
                  const s = SENSOR_REGISTRY[k];
                  return (
                    <div key={k} onClick={() => handleLibAdd(k)} style={{
                      position: "relative", padding: 20, borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid #1a2a3a",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 16, transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      overflow: "hidden"
                    }} onMouseEnter={e => { e.currentTarget.style.borderColor = "#00ff88"; e.currentTarget.style.background = "rgba(0,255,136,0.05)"; e.currentTarget.style.transform = "translateY(-2px)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a2a3a"; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.transform = "translateY(0)"; }}>
                      <div style={{ fontSize: 32, background: "rgba(0,0,0,0.3)", width: 56, height: 56, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${s.color}22` }}>{s.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, color: "#fff", fontWeight: 800, marginBottom: 2 }}>{s.label}</div>
                        <div style={{ fontSize: 11, color: "#4a6a5a", fontWeight: 600 }}>{s.name}</div>
                        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                          <span style={{ fontSize: 9, color: "#c0d8cc", background: "#1a2a3a", padding: "2px 6px", borderRadius: 4 }}>{s.unit}</span>
                          <span style={{ fontSize: 9, color: "#c0d8cc", background: "#1a2a3a", padding: "2px 6px", borderRadius: 4 }}>{s.min}/{s.max}</span>
                        </div>
                      </div>
                      <div style={{ position: "absolute", right: 20, color: "#00ff88", opacity: 0, transition: "all 0.2s" }} className="add-indicator">+</div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Web Serial Hook ──────────────────────────
// Desteklenen protokoller: ascii | json | binary
// onPacket({ key, value }) — parse edilen her veri noktası
// onLog({ text, color })   — bağlantı/hata mesajları
function useSerialPort({ protocol, onPacket, onLog, onRaw }) {
  const [connected, setConnected] = useState(false);
  const [supported] = useState(() => "serial" in navigator);
  const portRef   = useRef(null);
  const readerRef = useRef(null);
  const writerRef = useRef(null);

  // Callback'leri ref içinde saklayarak sonsuz döngüleri önlüyoruz
  const onPacketRef = useRef(onPacket);
  const onLogRef = useRef(onLog);
  const onRawRef = useRef(onRaw);
  
  useEffect(() => { onPacketRef.current = onPacket; }, [onPacket]);
  useEffect(() => { onLogRef.current = onLog; }, [onLog]);
  useEffect(() => { onRawRef.current = onRaw; }, [onRaw]);

  const safeLog = useCallback((log) => onLogRef.current?.(log), []);

  const disconnect = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (writerRef.current) {
        writerRef.current.releaseLock();
        writerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch { /* ... */ }
    setConnected(false);
    safeLog({ text: "Seri port bağlantısı kesildi.", color: "#ff9f43" });
  }, [safeLog]);

  const send = useCallback(async (data) => {
    if (!portRef.current || !portRef.current.writable) {
      safeLog({ text: "Hata: Port yazılabilir değil.", color: "#ff4757" });
      return;
    }
    try {
      const writer = portRef.current.writable.getWriter();
      writerRef.current = writer;
      let payload = typeof data === "string" ? new TextEncoder().encode(data) : data;
      await writer.write(payload);
      writer.releaseLock();
      writerRef.current = null;
      onRawRef.current?.(payload, "tx");
    } catch (e) {
      safeLog({ text: `Gönderim hatası: ${e.message}`, color: "#ff4757" });
      if (writerRef.current) { try { writerRef.current.releaseLock(); } catch {} writerRef.current = null; }
    }
  }, [safeLog]);

  const connect = useCallback(async (baudRate) => {
    if (!supported) return;
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });
      portRef.current = port;
      setConnected(true);
      safeLog({ text: `Bağlandı — ${baudRate} baud, protokol: ${protocol.toUpperCase()}`, color: "#00ff88" });

      const reader = port.readable.getReader();
      readerRef.current = reader;
      const dec = new TextDecoder();
      let lineBuf = "";
      let binBuf = [];

      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            onRawRef.current?.(value, "rx");

            if (protocol === "binary") {
              for (const byte of value) {
                if (byte === 0xAA) { binBuf = [byte]; }
                else if (binBuf.length > 0) {
                  binBuf.push(byte);
                  if (binBuf.length === 5) {
                    const parsed = PROTOCOLS.binary.parsePacket(binBuf);
                    if (parsed) onPacketRef.current?.(parsed);
                    else safeLog({ text: `Binary checksum hatası: [${binBuf.map((b) => "0x" + b.toString(16).padStart(2, "0")).join(" ")}]`, color: "#ff4757" });
                    binBuf = [];
                  }
                }
              }
            } else {
              lineBuf += dec.decode(value, { stream: true });
              const lines = lineBuf.split(/\r?\n/);
              lineBuf = lines.pop();
              for (const line of lines) {
                if (!line.trim()) continue;
                const parsed = PROTOCOLS[protocol]?.parse(line);
                if (parsed) onPacketRef.current?.(parsed);
                else safeLog({ text: `[RAW] ${line}`, color: "#3a5a4a" });
              }
            }
          }
        } catch (e) {
          safeLog({ text: `Okuma hatası: ${e.message}`, color: "#ff4757" });
        } finally {
          reader.releaseLock();
          setConnected(false);
        }
      })();
    } catch (e) {
      safeLog({ text: `Bağlantı hatası: ${e.message}`, color: "#ff4757" });
    }
  }, [supported, protocol, safeLog]);

  useEffect(() => () => { disconnect(); }, [disconnect]);

  return { connected, supported, connect, disconnect, send };
}

function TracePanel({ history, onSend, font, rules, setRules, echoEnabled, setEchoEnabled }) {
  const [input, setInput] = useState("");
  const [lineEnding, setLineEnding] = useState("\n");
  const [viewMode, setViewMode] = useState("ascii"); // ascii | hex
  const [showLogic, setShowLogic] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history]);

  const handleSend = () => {
    if (!input) return;
    let data = input;
    if (lineEnding === "\n") data += "\n";
    if (lineEnding === "\r\n") data += "\r\n";
    onSend(data);
    setInput("");
  };

  const exportLog = () => {
    const text = history.map(h => `[${h.time}] ${h.type.toUpperCase()}: ${h.text}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trace_log_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: 450, fontFamily: font }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a1118", padding: "8px 12px", borderRadius: 8, border: "1px solid #1a2a22" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#00ff88", fontWeight: 700 }}>TRACE & TERMINAL</span>
          <div style={{ width: 1, height: 12, background: "#1a2a22" }} />
          {["ascii", "hex"].map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: "2px 8px", borderRadius: 4, border: "1px solid",
              borderColor: viewMode === m ? "#00ff88" : "#1a2a22",
              background: viewMode === m ? "#00ff8822" : "transparent",
              color: viewMode === m ? "#00ff88" : "#4a6a5a",
              cursor: "pointer", fontSize: 9, textTransform: "uppercase"
            }}>{m}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowLogic(!showLogic)} style={{
            padding: "4px 10px", borderRadius: 4, border: "1px solid #1a2a22", 
            background: showLogic ? "#ff9f4322" : "#0d1520", color: showLogic ? "#ff9f43" : "#4a6a5a",
            cursor: "pointer", fontSize: 10
          }}>⚙ OTOMASYON</button>
          <button onClick={exportLog} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #1a2a22", background: "#0d1520", color: "#4ecdc4", cursor: "pointer", fontSize: 10 }}>⬇ İNDİR</button>
        </div>
      </div>

      {/* Logic Panel */}
      {showLogic && (
        <div style={{ background: "#060a11", border: "1px solid #ff9f4344", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
           <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
             <span style={{ fontSize: 11, color: "#ff9f43", fontWeight: 700 }}>OTOMASYON AYARLARI</span>
             <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
               <span style={{ fontSize: 10, color: "#4a6a5a" }}>ECHO:</span>
               <button onClick={() => setEchoEnabled(!echoEnabled)} style={{ padding: "2px 8px", borderRadius: 4, background: echoEnabled ? "#ff9f43" : "#1a2a22", color: echoEnabled ? "#000" : "#4a6a5a", border: "none", cursor: "pointer", fontSize: 10 }}>{echoEnabled ? "AÇIK" : "KAPALI"}</button>
             </div>
           </div>
        </div>
      )}

      {/* Main Screen */}
      <div ref={scrollRef} style={{
        flex: 1, background: "#05080c", border: "1px solid #1a2a22", borderRadius: 8,
        padding: 12, overflowY: "auto", fontSize: 11, display: "flex", flexDirection: "column", gap: 3
      }}>
        {history.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 8, opacity: 0.9, lineHeight: "1.4" }}>
            <span style={{ color: "#2a3a32", minWidth: 70, fontSize: 10 }}>[{item.time}]</span>
            <span style={{ 
              color: item.type === "tx" ? "#00ff88" : item.type === "rx" ? "#4ecdc4" : "#ff9f43",
              fontWeight: 700, minWidth: 24, fontSize: 9
            }}>
              {item.type.toUpperCase()}
            </span>
            <span style={{ color: item.type === "tx" ? "#c0d8cc" : item.type === "rx" ? "#fff" : (item.color || "#ff9f43"), whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {viewMode === "hex" ? (item.hex || toHex(item.text)) : item.text.replace(/\n/g, "\\n").replace(/\r/g, "\\r")}
            </span>
          </div>
        ))}
        {history.length === 0 && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#1a2a22", fontStyle: "italic" }}>Veri akışı bekleniyor...</div>}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 6 }}>
        <input 
          placeholder="Komut gönder... (Enter)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          style={{ flex: 1, background: "#0d1520", border: "1px solid #1a2a2a", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 12, outline: "none" }}
        />
        <select value={lineEnding} onChange={e => setLineEnding(e.target.value)} style={{ background: "#0d1520", border: "1px solid #1a2a2a", borderRadius: 6, color: "#4a6a5a", padding: "0 8px", fontSize: 10 }}>
          <option value="">Ek yok</option>
          <option value="\n">\n</option>
          <option value="\r\n">\r\n</option>
        </select>
        <button onClick={handleSend} style={{ padding: "0 20px", background: "#00ff88", border: "none", borderRadius: 6, color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>GÖNDER</button>
      </div>
    </div>
  );
}

// ── Serial Panel ─────────────────────────────
function SerialPanel({ connected, supported, protocol, setProtocol, baudRate, onConnect, onDisconnect, font, echoEnabled, setEchoEnabled }) {
  const statusColor = !supported ? "#ff4757" : connected ? "#00ff88" : "#4a6a5a";
  const statusText  = !supported ? "Desteklenmiyor (Chrome/Edge gerekli)" : connected ? "Bağlı" : "Bağlı Değil";

  return (
    <div style={{
      display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
      padding: "10px 12px", background: "#0a1118",
      borderRadius: 10, border: "1px solid #1a2a22", marginBottom: 12,
    }}>
      {/* Başlık */}
      <div style={{ fontSize: 10, color: "#4a6a5a", letterSpacing: 1, marginRight: 4 }}>SERIAL PORT</div>

      {/* Durum göstergesi */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%", background: statusColor,
          boxShadow: connected ? `0 0 6px ${statusColor}` : "none",
        }} />
        <span style={{ fontSize: 11, color: statusColor, fontFamily: font }}>{statusText}</span>
      </div>

      <div style={{ width: 1, height: 20, background: "#1a2a22" }} />

      {/* Echo Mode */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: "#4a6a5a" }}>ECHO</span>
        <button 
          onClick={() => setEchoEnabled(!echoEnabled)} 
          style={{
            padding: "3px 8px", borderRadius: 4, border: "1px solid",
            borderColor: echoEnabled ? "#ff9f43" : "#1a2a22",
            background: echoEnabled ? "#ff9f4322" : "transparent",
            color: echoEnabled ? "#ff9f43" : "#4a6a5a",
            cursor: "pointer", fontFamily: font, fontSize: 10
          }}
        >
          {echoEnabled ? "ON" : "OFF"}
        </button>
      </div>

      <div style={{ width: 1, height: 20, background: "#1a2a22" }} />

      {/* Protokol seçimi */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 10, color: "#4a6a5a" }}>PROTOKOL</span>
        {Object.entries(PROTOCOLS).map(([k, p]) => (
          <button key={k} disabled={connected} onClick={() => setProtocol(k)} style={{
            padding: "3px 10px", borderRadius: 4, border: "1px solid",
            borderColor: protocol === k ? p.color : "#1a2a22",
            background: protocol === k ? `${p.color}20` : "transparent",
            color: protocol === k ? p.color : "#4a6a5a",
            cursor: connected ? "not-allowed" : "pointer",
            fontFamily: font, fontSize: 11, opacity: connected ? 0.5 : 1,
          }}>{p.label}</button>
        ))}
      </div>

      <div style={{ width: 1, height: 20, background: "#1a2a22" }} />

      {/* Örnek format */}
      <span style={{ fontSize: 10, color: "#3a5a4a", fontFamily: font }}>
        Örnek: <span style={{ color: PROTOCOLS[protocol].color }}>{PROTOCOLS[protocol].example}</span>
      </span>

      {/* Bağlan / Kes */}
      <button
        disabled={!supported}
        onClick={connected ? onDisconnect : () => onConnect(baudRate)}
        style={{
          marginLeft: "auto", padding: "6px 16px", borderRadius: 6,
          border: `1px solid ${connected ? "#ff4757" : "#00ff88"}`,
          background: connected ? "#ff475718" : "#00ff8818",
          color: connected ? "#ff4757" : "#00ff88",
          cursor: supported ? "pointer" : "not-allowed",
          fontFamily: font, fontSize: 12, fontWeight: 600,
          opacity: supported ? 1 : 0.4,
        }}
      >
        {connected ? "⏏ Bağlantıyı Kes" : "⚡ Porta Bağlan"}
      </button>
    </div>
  );
}

// ── Firmware Tab ──────────────────────────────
function FirmwareTab({ font }) {
  const [selected, setSelected] = useState("arduino_ascii");
  const ex = FIRMWARE_EXAMPLES[selected];

  const copyToClipboard = () => {
    navigator.clipboard.writeText(ex.code).catch(() => {});
  };

  return (
    <div>
      {/* Seçim butonları */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.entries(FIRMWARE_EXAMPLES).map(([k, v]) => (
          <button key={k} onClick={() => setSelected(k)} style={{
            padding: "5px 12px", borderRadius: 6,
            border: `1px solid ${selected === k ? "#00ff88" : "#1a2a22"}`,
            background: selected === k ? "#00ff8815" : "transparent",
            color: selected === k ? "#00ff88" : "#4a6a5a",
            cursor: "pointer", fontFamily: font, fontSize: 11,
          }}>{v.label}</button>
        ))}
      </div>

      {/* Kod bloğu */}
      <div style={{ position: "relative" }}>
        <button onClick={copyToClipboard} style={{
          position: "absolute", top: 8, right: 8,
          padding: "3px 10px", borderRadius: 4,
          border: "1px solid #1a3a2a", background: "#0a0e14",
          color: "#4a6a5a", cursor: "pointer", fontFamily: font, fontSize: 10,
          zIndex: 1,
        }}>Kopyala</button>
        <pre style={{
          margin: 0, padding: "14px 16px", background: "#080c12",
          border: "1px solid #1a2a22", borderRadius: 8,
          color: "#c0d8cc", fontFamily: font, fontSize: 12,
          lineHeight: 1.6, overflowX: "auto", whiteSpace: "pre",
        }}>{ex.code}</pre>
      </div>

      {/* Protokol referansı */}
      <div style={{
        marginTop: 12, padding: 12, background: "#080c12",
        border: "1px solid #1a2a22", borderRadius: 8,
        fontSize: 11, color: "#4a6a5a", lineHeight: 1.8,
      }}>
        <strong style={{ color: "#ffd93d" }}>Binary Paket Formatı</strong>
        {"  "}[0xAA][SENSOR_ID][VAL_HI][VAL_LO][XOR]
        <br />
        <strong style={{ color: "#ffd93d" }}>Sensor ID:</strong>
        {"  "}
        {[["0x00","DS18B20","×0.0625"],["0x01","DHT22","×0.1"],["0x02","BMP280","×0.01"],["0x03","MPU6050","×1/16384"]].map(([id,name,scale]) => (
          <span key={id} style={{ marginRight: 16 }}>
            <span style={{ color: "#a29bfe" }}>{id}</span> = {name} <span style={{ color: "#4a6a5a" }}>({scale})</span>
          </span>
        ))}
        <br />
        <strong style={{ color: "#ffd93d" }}>XOR:</strong>{"  "}0xAA ^ SENSOR_ID ^ VAL_HI ^ VAL_LO
      </div>
    </div>
  );
}

// ── Usage Guide Tab ──────────────────────────
function UsageGuideTab({ font }) {
  const H = ({ children }) => (
    <div style={{ color: "#00ff88", fontFamily: font, fontWeight: 700, fontSize: 13,
      marginBottom: 6, marginTop: 16, borderBottom: "1px solid #1a2a22", paddingBottom: 4 }}>
      {children}
    </div>
  );
  const Row = ({ icon, title, desc }) => (
    <div style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{ color: "#c0d8cc", fontSize: 12, fontWeight: 600 }}>{title}</div>
        <div style={{ color: "#5a7a6a", fontSize: 11, lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
  const Code = ({ children }) => (
    <code style={{ background: "#080c12", border: "1px solid #1a2a22", borderRadius: 4,
      padding: "1px 6px", color: "#ffd93d", fontFamily: font, fontSize: 11 }}>
      {children}
    </code>
  );

  const sensorTable = [
    // Çevresel
    { id: "0x00", name: "DS18B20",       label: "Sıcaklık",        unit: "°C",   scale: "× 0.0625",    color: "#ff6b6b", cat: "Çevresel" },
    { id: "0x01", name: "DHT22",         label: "Nem",             unit: "%RH",  scale: "× 0.1",       color: "#4ecdc4", cat: "Çevresel" },
    { id: "0x02", name: "BMP280",        label: "Basınç",          unit: "hPa",  scale: "× 0.01",      color: "#a29bfe", cat: "Çevresel" },
    { id: "0x03", name: "MPU6050",       label: "İvme X",          unit: "g",    scale: "× 1/16384",   color: "#fdcb6e", cat: "Hareket"  },
    // Sağlık
    { id: "0x10", name: "AD8232",        label: "EKG",             unit: "mV",   scale: "(raw-2048)/600", color: "#ff4d6d", cat: "Sağlık" },
    { id: "0x11", name: "MAX30102_SPO2", label: "SpO₂",            unit: "%",    scale: "× 0.1",       color: "#e84393", cat: "Sağlık"  },
    { id: "0x12", name: "MAX30102_HR",   label: "Nabız",           unit: "bpm",  scale: "× 1",         color: "#ff6b9d", cat: "Sağlık"  },
    { id: "0x13", name: "MLX90614",      label: "Vücut Sıcaklığı", unit: "°C",   scale: "× 0.02",      color: "#ff8c42", cat: "Sağlık"  },
    { id: "0x14", name: "GSR",           label: "GSR (Stres)",     unit: "kΩ",   scale: "× 0.1",       color: "#c77dff", cat: "Sağlık"  },
  ];

  return (
    <div style={{ color: "#c0d8cc", fontFamily: font, fontSize: 12, lineHeight: 1.7 }}>

      <H>Simülatör Nedir?</H>
      <p style={{ color: "#5a7a6a", marginTop: 0 }}>
        UART bit seviyesinde animasyon, hata enjeksiyonu ve gerçek donanım bağlantısı destekleyen
        bir sensör test platformudur. Simülasyon modunda çalışır, veya USB-UART adaptörü ile
        gerçek sensör verisini görselleştirir.
      </p>

      <H>Simülasyon Modu</H>
      <Row icon="▶" title="BAŞLAT / DURDUR" desc="Simülasyonu başlatır. Sensörler matematiksel modelle sahte veri üretir." />
      <Row icon="⚡" title="Hız (0.5x – 4x)" desc="Örnekleme ve animasyon hızını değiştirir." />
      <Row icon="📡" title="Baud Rate" desc="9600'dan 115200'e kadar. Frame süresi ve bit genişliği otomatik hesaplanır." />
      <Row icon="⚠" title="Hata Enjeksiyonu" desc="Parity veya Framing hatası %20 olasılıkla rastgele enjekte eder. Osiloskop ve log'da kırmızı gösterilir." />
      <Row icon="➕" title="Özel Sensör Ekle" desc="Min/max/renk tanımlayarak kendi sensörünü simüle et. Binary ID otomatik atanmaz; ASCII veya JSON protokolüyle gönder." />

      <H>Seri Port Bağlantısı (Gerçek Donanım)</H>
      <Row icon="🔌" title="Porta Bağlan" desc="Chrome veya Edge tarayıcısı gereklidir. USB-UART adaptörü (CP2102, CH340, FT232) veya doğrudan USB destekli kart yeterli." />
      <Row icon="📝" title="ASCII Protokolü" desc={<>Mikrodenetleyiciden <Code>DS18B20:23.450\n</Code> gönder. Herhangi bir sensör adı çalışır.</>} />
      <Row icon="📦" title="JSON Protokolü" desc={<>{"{"}<Code>"s":"DS18B20","v":23.45</Code>{"}"} formatı. <Code>sensor/s/name</Code> ve <Code>value/v/val</Code> alanları tanınır.</>} />
      <Row icon="⚙" title="Binary Protokolü" desc={<><Code>[0xAA][ID][HI][LO][XOR]</Code> — 5 byte. Checksum = 0xAA⊕ID⊕HI⊕LO. Aşağıdaki tablodan ID seç.</>} />

      <H>Sensör Referans Tablosu</H>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1a2a22" }}>
              {["Binary ID","Sensör","Ölçüm","Birim","Ham→Değer","Kategori"].map((h) => (
                <th key={h} style={{ padding: "4px 10px", textAlign: "left", color: "#4a6a5a", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sensorTable.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #0f1820" }}>
                <td style={{ padding: "4px 10px", color: "#a29bfe", fontFamily: font }}>{r.id}</td>
                <td style={{ padding: "4px 10px", color: r.color }}>{r.name}</td>
                <td style={{ padding: "4px 10px", color: "#c0d8cc" }}>{r.label}</td>
                <td style={{ padding: "4px 10px", color: "#5a7a6a" }}>{r.unit}</td>
                <td style={{ padding: "4px 10px", color: "#ffd93d", fontFamily: font }}>{r.scale}</td>
                <td style={{ padding: "4px 10px", color: "#4a6a5a" }}>{r.cat}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H>Ekranlar</H>
      <Row icon="📡" title="Osiloskop"
        desc="UART sinyalini bit bazında gösterir. Her bit renkli, animasyonlu ve etiketli. Hatalı bit kırmızı vurgulanır." />
      <Row icon="⚡" title="Baud Karşılaştırma"
        desc="Aynı byte'ın 9600 / 57600 / 115200 baud'daki zamansal farkını gösterir." />
      <Row icon="📋" title="İletim Logu"
        desc="Her frame için timestamp, sensör ikonu, ham byte değerleri ve hata uyarıları." />
      <Row icon="💻" title="Firmware"
        desc="Arduino, ESP32, ESP8266 ve STM32 için copy-paste hazır kod örnekleri. Her 3 protokol için ayrı örnek." />

      <H>Sağlık Sensörleri Notları</H>
      <Row icon="💓" title="AD8232 — EKG"
        desc="PQRST kompleksi simüle edilir. Gerçek kullanımda analog çıkışı ADC ile oku, baseline çıkar, 12-bit raw gönder (ID: 0x10)." />
      <Row icon="🫁" title="MAX30102 — SpO₂ & Nabız"
        desc="Kızılötesi + kırmızı LED reflektans. SpO₂ için ID 0x11 (raw × 0.1 = %), nabız için ID 0x12 (raw = bpm). I2C adresi: 0x57." />
      <Row icon="🌡" title="MLX90614 — Temassız Sıcaklık"
        desc="IR vücut sıcaklığı. Değer × 0.02 = °C. I2C adresi: 0x5A. Binary ID: 0x13." />
      <Row icon="🧠" title="GSR — Galvanik Deri Yanıtı"
        desc="Deri iletkenliğinden stres/uyarılmışlık tahmini. Değer kΩ cinsinden. Yüksek değer = düşük iletkenlik = düşük stres." />
    </div>
  );
}

// ── Byte Analyzer ────────────────────────────
function ByteAnalyzer({ font, baudRate }) {
  const [hexVal, setHexVal] = useState("A5");
  const [decVal, setDecVal] = useState("165");
  const [binVal, setBinVal] = useState("10100101");
  const [localParity, setLocalParity] = useState("none");
  const [localStop, setLocalStop] = useState(1);
  const [localError, setLocalError] = useState(null);

  const byteNum = useMemo(() => {
    const n = parseInt(hexVal, 16);
    return !isNaN(n) && n >= 0 && n <= 255 ? n : null;
  }, [hexVal]);

  const frame = useMemo(
    () => (byteNum !== null ? buildUartFrame(byteNum, localParity, localStop, localError) : null),
    [byteNum, localParity, localStop, localError]
  );

  const syncFrom = (n) => {
    setHexVal(n.toString(16).toUpperCase().padStart(2, "0"));
    setDecVal(n.toString());
    setBinVal(n.toString(2).padStart(8, "0"));
  };

  const onHex = (e) => {
    const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 2).toUpperCase();
    setHexVal(v);
    const n = parseInt(v, 16);
    if (!isNaN(n) && n <= 255) {
      setDecVal(n.toString());
      setBinVal(n.toString(2).padStart(8, "0"));
    }
  };

  const onDec = (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 3);
    setDecVal(v);
    const n = parseInt(v);
    if (!isNaN(n) && n <= 255) {
      setHexVal(n.toString(16).toUpperCase().padStart(2, "0"));
      setBinVal(n.toString(2).padStart(8, "0"));
    }
  };

  const onBin = (e) => {
    const v = e.target.value.replace(/[^01]/g, "").slice(0, 8);
    setBinVal(v);
    if (v.length === 8) {
      const n = parseInt(v, 2);
      setHexVal(n.toString(16).toUpperCase().padStart(2, "0"));
      setDecVal(n.toString());
    }
  };

  const inputStyle = {
    background: "#0d1520", border: "1px solid #1a3a2a", borderRadius: 4,
    color: "#c0d8cc", padding: "6px 10px", fontFamily: font, fontSize: 14,
    outline: "none", width: "100%", boxSizing: "border-box",
  };

  const bitDuration = (1 / baudRate) * 1e6;
  const frameDuration = frame ? frame.bits.length * bitDuration : 0;

  const COMMON_BYTES = [
    { label: "0x00 NUL", val: 0x00 }, { label: "0x0A LF", val: 0x0A },
    { label: "0x0D CR", val: 0x0D },  { label: "0x41 'A'", val: 0x41 },
    { label: "0x55 alt.", val: 0x55 }, { label: "0xAA alt.", val: 0xAA },
    { label: "0xFF all1", val: 0xFF },
  ];

  return (
    <div style={{ color: "#c0d8cc" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>

        {/* Input group */}
        <div style={{ flex: "0 0 240px" }}>
          <div style={{ fontSize: 10, color: "#4a6a5a", marginBottom: 8, letterSpacing: 1 }}>BYTE GİRİŞİ</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <label style={{ fontSize: 10, color: "#4a6a5a", display: "block", marginBottom: 3 }}>HEX (0x00 – 0xFF)</label>
              <input
                style={{ ...inputStyle, color: "#a29bfe", fontSize: 20, letterSpacing: 6, textAlign: "center" }}
                value={hexVal} onChange={onHex} maxLength={2} placeholder="A5"
              />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#4a6a5a", display: "block", marginBottom: 3 }}>DECIMAL (0 – 255)</label>
              <input style={{ ...inputStyle, textAlign: "center" }} value={decVal} onChange={onDec} maxLength={3} placeholder="165" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#4a6a5a", display: "block", marginBottom: 3 }}>BINARY</label>
              <input
                style={{ ...inputStyle, letterSpacing: 4, textAlign: "center", fontSize: 13 }}
                value={binVal} onChange={onBin} maxLength={8} placeholder="10100101"
              />
            </div>
          </div>
        </div>

        {/* Frame config */}
        <div style={{ flex: "0 0 220px" }}>
          <div style={{ fontSize: 10, color: "#4a6a5a", marginBottom: 8, letterSpacing: 1 }}>FRAME AYARLARI</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "#4a6a5a", marginBottom: 4 }}>PARİTE</div>
              <div style={{ display: "flex", gap: 4 }}>
                {Object.entries(PARITY_MODES).map(([k, v]) => (
                  <button key={k} onClick={() => setLocalParity(k)} style={{
                    flex: 1, padding: "4px 0", borderRadius: 4, border: "1px solid",
                    borderColor: localParity === k ? "#a29bfe" : "#1a2a22",
                    background: localParity === k ? "#a29bfe22" : "transparent",
                    color: localParity === k ? "#a29bfe" : "#4a6a5a",
                    cursor: "pointer", fontFamily: font, fontSize: 11,
                  }}>{v.label}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#4a6a5a", marginBottom: 4 }}>STOP BİT</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2].map((s) => (
                  <button key={s} onClick={() => setLocalStop(s)} style={{
                    flex: 1, padding: "4px 0", borderRadius: 4, border: "1px solid",
                    borderColor: localStop === s ? "#ffd93d" : "#1a2a22",
                    background: localStop === s ? "#ffd93d22" : "transparent",
                    color: localStop === s ? "#ffd93d" : "#4a6a5a",
                    cursor: "pointer", fontFamily: font, fontSize: 11,
                  }}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#4a6a5a", marginBottom: 4 }}>HATA ENJEKTE ET</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { k: null, l: "Yok", c: "#4a6a5a" },
                  { k: "parity", l: "Parity", c: "#ff6b6b" },
                  { k: "framing", l: "Framing", c: "#ff9f43" },
                ].map(({ k, l, c }) => (
                  <button key={String(k)} onClick={() => setLocalError(k)} style={{
                    flex: 1, padding: "4px 0", borderRadius: 4, border: "1px solid",
                    borderColor: localError === k ? c : "#1a2a22",
                    background: localError === k ? `${c}22` : "transparent",
                    color: localError === k ? c : "#4a6a5a",
                    cursor: "pointer", fontFamily: font, fontSize: 10,
                  }}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Timing info */}
        {frame && byteNum !== null && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, color: "#4a6a5a", marginBottom: 8, letterSpacing: 1 }}>ZAMANLAMA & BİLGİ</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
              {[
                { label: "Byte", value: `0x${byteNum.toString(16).toUpperCase().padStart(2,"0")} = ${byteNum} = 0b${byteNum.toString(2).padStart(8,"0")}` },
                { label: "Toplam Bit", value: `${frame.bits.length} (1S + 8D${localParity !== "none" ? " + 1P" : ""} + ${localStop}ST)` },
                { label: "Bit Süresi", value: `${bitDuration.toFixed(2)} µs @ ${baudRate} baud` },
                { label: "Frame Süresi", value: `${frameDuration.toFixed(2)} µs = ${(frameDuration/1000).toFixed(4)} ms` },
                { label: "Max Throughput", value: `${Math.floor(1e6 / frameDuration)} frame/sn` },
                { label: "Parity Biti", value: frame.parityBit !== null ? frame.parityBit.toString() : "Yok" },
                { label: "Durum", value: frame.hasError ? "⚠ HATA VAR" : "✓ Temiz Frame" },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: "#4a6a5a", minWidth: 110 }}>{label}:</span>
                  <span style={{ color: label === "Durum" ? (frame.hasError ? "#ff4757" : "#00ff88") : "#c0d8cc" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Common bytes quick select */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "#4a6a5a", marginBottom: 6, letterSpacing: 1 }}>HIZLI SEÇIM</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {COMMON_BYTES.map(({ label, val }) => (
            <button key={label} onClick={() => syncFrom(val)} style={{
              padding: "3px 10px", borderRadius: 4, border: "1px solid",
              borderColor: byteNum === val ? "#00ff88" : "#1a2a22",
              background: byteNum === val ? "#00ff8822" : "transparent",
              color: byteNum === val ? "#00ff88" : "#4a6a5a",
              cursor: "pointer", fontFamily: font, fontSize: 10,
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Frame visualization */}
      <div style={{ fontSize: 10, color: "#3a5a4a", marginBottom: 12, letterSpacing: 2, fontWeight: 700 }}>UART FRAME EXPLORER</div>
      {frame ? (
        <div style={{ background: "rgba(0,0,0,0.2)", padding: 16, borderRadius: 12, border: "1px solid #1a2a3a" }}>
          <BitFrameDisplay 
            frame={frame} 
            activeBit={-1} 
            playing={false} 
            onBitToggle={(bitIdx) => {
              const newBits = binVal.split("");
              newBits[7 - bitIdx] = newBits[7 - bitIdx] === "1" ? "0" : "1";
              onBin({ target: { value: newBits.join("") } });
            }}
          />
          <div style={{ fontSize: 10, color: "#4a6a5a", marginTop: 10, textAlign: "center" }}>
            💡 Veriyi değiştirmek için yukarıdaki bit kutucuklarına tıklayabilirsiniz.
          </div>
        </div>
      ) : (
        <div style={{ color: "#ff4757", fontSize: 12, padding: 8 }}>Geçersiz byte değeri (0x00 – 0xFF arası girin)</div>
      )}
    </div>
  );
}

function CanAnalyzer({ canFrames, font }) {
  const frames = Object.entries(canFrames).sort((a, b) => b[1].time - a[1].time);

  return (
    <div style={{ color: "#c0d8cc", fontFamily: font }}>
      <div style={{ fontSize: 10, color: "#4a6a5a", letterSpacing: 2, marginBottom: 12, fontWeight: 700 }}>CAN BUS ANALYZER (SLCAN)</div>
      {frames.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#2a3a32", border: "1px dashed #1a2a22", borderRadius: 12 }}>
          Henüz CAN paketi alınmadı. <br/><span style={{ fontSize: 10 }}>SLCAN protokolünde 'tIDDLCData' formatında veri bekliyor.</span>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1a2a3a" }}>
              {["ID", "DLC", "DATA (HEX)", "PERIOD", "TIME"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: 10, color: "#4a6a5a" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {frames.map(([id, f]) => (
              <tr key={id} style={{ borderBottom: "1px solid #0d1624", background: Date.now() - f.time < 500 ? "#00ff8808" : "none", transition: "background 0.5s" }}>
                <td style={{ padding: 10, color: "#ff7675", fontWeight: 700 }}>0x{id.padStart(3, "0")}</td>
                <td style={{ padding: 10, color: "#4ecdc4" }}>{f.dlc}</td>
                <td style={{ padding: 10, color: "#ffd93d", letterSpacing: 1 }}>{f.data.match(/.{1,2}/g).join(" ")}</td>
                <td style={{ padding: 10, color: "#5a7a6a" }}>{f.period ? `${f.period}ms` : "-"}</td>
                <td style={{ padding: 10, color: "#3a5a4a", fontSize: 10 }}>{new Date(f.time).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}


function Terminal({ history, onSend, onClear, font }) {
  const [input, setInput] = useState("");
  const [lineEnding, setLineEnding] = useState("\\n");
  const [viewMode, setViewMode] = useState("ascii"); // ascii | hex
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const handleSend = () => {
    if (!input) return;
    let data = input;
    if (lineEnding === "\\n") data += "\n";
    if (lineEnding === "\\r\\n") data += "\r\n";
    onSend(data);
    setInput("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, height: "100%" }}>
      {/* Terminal Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["ascii", "hex"].map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: "4px 12px", borderRadius: 6, border: "1px solid",
              borderColor: viewMode === m ? "#00ff88" : "#1a2a22",
              background: viewMode === m ? "rgba(0,255,136,0.1)" : "transparent",
              color: viewMode === m ? "#00ff88" : "#4a6a5a",
              cursor: "pointer", fontFamily: font, fontSize: 10, textTransform: "uppercase",
              fontWeight: 700, transition: "all 0.2s"
            }}>{m}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 10, color: "#3a5a4a", opacity: 0.6 }}>{history.length} paket izleniyor</div>
          <button onClick={onClear} title="Terminali Temizle" style={{
            background: "none", border: "none", color: "#ff4757", cursor: "pointer", fontSize: 14, padding: "2px 6px"
          }}>🗑</button>
        </div>
      </div>

      {/* Terminal Screen */}
      <div ref={scrollRef} style={{
        flex: 1, background: "#060a11", border: "1px solid #1a2a22", borderRadius: 12,
        padding: 16, overflowY: "auto", fontFamily: font, fontSize: 12, display: "flex", flexDirection: "column", gap: 8,
        boxShadow: "inset 0 0 20px rgba(0,0,0,0.5)"
      }}>
        {history.map((item, i) => {
          const isTx = item.type === "tx";
          const isSys = item.type === "sys";
          
          return (
            <div key={i} style={{ 
              display: "flex", 
              flexDirection: "column",
              alignSelf: isSys ? "center" : (isTx ? "flex-end" : "flex-start"),
              maxWidth: "85%",
              gap: 2
            }}>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 6, 
                fontSize: 9, 
                color: "#3a5a4a",
                justifyContent: isSys ? "center" : (isTx ? "flex-end" : "flex-start")
              }}>
                <span style={{ fontWeight: 700, color: isTx ? "#00ff88" : (isSys ? "#6a8a7a" : "#4ecdc4") }}>
                  {isTx ? "TX" : (isSys ? "SIM" : "RX")}
                </span>
                <span>[{item.time}]</span>
              </div>
              <div style={{
                background: isSys ? "rgba(255,255,255,0.03)" : (isTx ? "rgba(0,255,136,0.08)" : "rgba(78,205,196,0.08)"),
                border: `1px solid ${isSys ? "#1a2a22" : (isTx ? "#00ff8833" : "#4ecdc433")}`,
                padding: "6px 12px",
                borderRadius: isSys ? 6 : (isTx ? "12px 12px 2px 12px" : "12px 12px 12px 2px"),
                color: isTx ? "#c0d8cc" : "#fff",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                fontSize: 11
              }}>
                {viewMode === "hex" ? (item.hex || toHex(item.text)) : (item.text?.replace(/\n/g, "\\n").replace(/\r/g, "\\r"))}
              </div>
            </div>
          );
        })}
        {history.length === 0 && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#2a3a32", fontStyle: "italic" }}>
            Veri akışı bekleniyor...
          </div>
        )}
      </div>

      {/* Input Area */}
      <div style={{ display: "flex", gap: 8 }}>
        <input 
          placeholder="Seri porta veri gönder..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          style={{
            flex: 1, background: "#0d1520", border: "1px solid #1a3a2a", borderRadius: 8,
            padding: "12px 16px", color: "#fff", fontFamily: font, fontSize: 13, outline: "none",
            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)"
          }}
        />
        <select value={lineEnding} onChange={e => setLineEnding(e.target.value)} style={{
          background: "#0d1520", border: "1px solid #1a3a2a", borderRadius: 8,
          color: "#4a6a5a", padding: "0 10px", fontFamily: font, fontSize: 11, cursor: "pointer", outline: "none"
        }}>
          <option value="">Son ek yok</option>
          <option value="\\n">\n (LF)</option>
          <option value="\\r\\n">\r\n (CRLF)</option>
        </select>
        <button onClick={handleSend} style={{
          padding: "0 28px", background: "linear-gradient(135deg, #00ff88, #00cc6a)",
          border: "none", borderRadius: 8, color: "#000", fontWeight: 800, cursor: "pointer", fontFamily: font,
          transition: "transform 0.1s"
        }} onMouseDown={e => e.currentTarget.style.transform = "scale(0.96)"} onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}>GÖNDER</button>
      </div>
    </div>
  );
}

function SensorListItem({ sensor, pKey, isActive, onToggle, onClone, onRemove, onMove, isFirst, isLast }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", background: isActive ? `${sensor.color}15` : "rgba(255,255,255,0.02)",
      borderRadius: 12, border: `1px solid ${isActive ? sensor.color + "44" : "#1a2a22"}`,
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", 
      boxShadow: isActive ? `0 0 15px ${sensor.color}11` : "none"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", flex: 1 }} onClick={() => onToggle(pKey)}>
        <span style={{ fontSize: 24, filter: isActive ? "none" : "grayscale(1) opacity(0.5)" }}>{sensor.icon}</span>
        <div>
          <div style={{ fontSize: 13, color: isActive ? sensor.color : "#6a8a7a", fontWeight: 700 }}>{sensor.label || sensor.name}</div>
          <div style={{ fontSize: 9, color: "#3a5a4a", fontWeight: 600, letterSpacing: 0.5 }}>{isActive ? "ONLINE" : "STANDBY"}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={(e) => { e.stopPropagation(); onMove(pKey, -1); }} disabled={isFirst} title="Yukarı Taşı" style={{
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)",
          color: "#fff", borderRadius: 6, cursor: isFirst ? "default" : "pointer", fontSize: 12, opacity: isFirst ? 0.2 : 0.6, transition: "all 0.2s"
        }}>▲</button>
        <button onClick={(e) => { e.stopPropagation(); onMove(pKey, 1); }} disabled={isLast} title="Aşağı Taşı" style={{
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)",
          color: "#fff", borderRadius: 6, cursor: isLast ? "default" : "pointer", fontSize: 12, opacity: isLast ? 0.2 : 0.6, transition: "all 0.2s"
        }}>▼</button>
        <button onClick={(e) => { e.stopPropagation(); onClone(pKey); }} title="Klonla" style={{
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(78, 205, 196, 0.05)", border: "1px solid rgba(78, 205, 196, 0.2)",
          color: "#4ecdc4", borderRadius: 6, cursor: "pointer", fontSize: 14, transition: "all 0.2s"
        }}>⎘</button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(pKey); }} title="Çalışma alanından kaldır" style={{
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255, 71, 87, 0.05)", border: "1px solid rgba(255, 71, 87, 0.2)",
          color: "#ff4757", borderRadius: 6, cursor: "pointer", fontSize: 14, transition: "all 0.2s"
        }}>✕</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// ANA BİLEŞEN
// ══════════════════════════════════════════════
export default function UartSimulator() {
  // --- Persistence & State Initialization ---
  const [sensors, setSensors] = useState(() => {
    const saved = localStorage.getItem("uart_sensors");
    if (!saved) return { ...SENSOR_REGISTRY };
    try {
      const parsed = JSON.parse(saved);
      // Re-attach functions lost during JSON serialization, handling clones correctly
      Object.keys(parsed).forEach(k => {
        const s = parsed[k];
        const baseKey = s.baseType || k.replace(/_\d+$/, "");
        const base = SENSOR_REGISTRY[baseKey];
        if (base) {
          s.generate = base.generate;
          s.encodeBytes = base.encodeBytes;
        }
      });
      return parsed;
    } catch { return { ...SENSOR_REGISTRY }; }
  });
  const [activeSensors, setActiveSensors] = useState(() => {
    const saved = localStorage.getItem("uart_active_sensors");
    return saved ? JSON.parse(saved) : ["DS18B20", "DHT22"];
  });
  const [baudRate, setBaudRate] = useState(() => {
    const saved = localStorage.getItem("uart_baud");
    return saved ? Number(saved) : 9600;
  });
  const [parity, setParity] = useState("none");
  const [stopBits, setStopBits] = useState(1);
  const [errorMode, setErrorMode] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState("osiloskop");

  const [sensorHistories, setSensorHistories] = useState({});
  const [currentFrames, setCurrentFrames] = useState([]);
  const [showAddSensor, setShowAddSensor] = useState(false);
  const [quickResults, setQuickResults] = useState([]);
  const [trace, setTrace] = useState([]); // Birleşik Log + Terminal
  const [transmittedCount, setTransmittedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [throughput, setThroughput] = useState(0);
  const [serialProtocol, setSerialProtocol] = useState("ascii");
  const [echoEnabled, setEchoEnabled] = useState(false);
  const [responseRules, setResponseRules] = useState([
    { trigger: "PING", response: "PONG", enabled: true }
  ]);

  const timerRef = useRef(null);
  const tickRef = useRef(0);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(700);
  const transmitCountRef = useRef(0);
  const lastThroughputTimeRef = useRef(Date.now());
  const sensorsRef = useRef(sensors);

  useEffect(() => { sensorsRef.current = sensors; }, [sensors]);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem("uart_sensors", JSON.stringify(sensors));
  }, [sensors]);
  useEffect(() => {
    localStorage.setItem("uart_active_sensors", JSON.stringify(activeSensors));
  }, [activeSensors]);
  useEffect(() => {
    localStorage.setItem("uart_baud", baudRate.toString());
  }, [baudRate]);

  const timeStr = () => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`;
  };

  const generateSample = useCallback(() => {
    const t = tickRef.current;
    tickRef.current += 0.1;

    const newHistories = {};
    const frames = [];
    const traceEntries = [];

    // console.log("Generating sample for:", activeSensors);
    activeSensors.forEach((sKey) => {
      const s = sensorsRef.current[sKey];
      if (!s || typeof s.generate !== "function") {
        // console.warn("Generating skipped for:", sKey, " (Missing generate function)");
        return;
      }
      
      const val = Math.max(s.min, Math.min(s.max, s.generate(t)));
      const bytes = s.encodeBytes ? s.encodeBytes(val) : [];

      newHistories[sKey] = val;

      bytes.forEach((b) => {
        const frame = buildUartFrame(b, parity, stopBits, errorMode);
        frames.push(frame);
      });

      traceEntries.push({
        time: timeStr(),
        type: "sys",
        text: `${s.label}: ${val.toFixed(2)} ${s.unit}`,
        color: s.color
      });
    });

    if (activeSensors.length > 0) {
      setSensorHistories(prev => {
        const next = { ...prev };
        Object.entries(newHistories).forEach(([k, v]) => {
          next[k] = [...(next[k] || []).slice(-59), v];
        });
        return next;
      });
      setCurrentFrames(frames);
      setTransmittedCount(c => c + frames.length);
      setTrace(prev => [...prev.slice(-199), ...traceEntries.map(e => ({ ...e, hex: toHex(e.text) }))]);
    }

    // Throughput
    transmitCountRef.current += frames.length;
    const now = Date.now();
    if (now - lastThroughputTimeRef.current >= 1000) {
      setThroughput(transmitCountRef.current);
      transmitCountRef.current = 0;
      lastThroughputTimeRef.current = now;
    }
  }, [activeSensors, errorMode, parity, stopBits]);

  // Bit-level player isolated to avoid heavy re-renders
  function UartBitPlayer({ frames, playing, speed, font }) {
    const [fIdx, setFIdx] = useState(0);
    const [bIdx, setBIdx] = useState(0);

    useEffect(() => {
      if (!playing || frames.length === 0) return;
      const totalBits = frames.reduce((a, f) => a + f.bits.length, 0);
      const bitDuration = Math.max(30, 400 / (speed * (totalBits || 1)));
      let globalBit = 0;
      
      const timer = setInterval(() => {
        let cumBits = 0;
        for (let fi = 0; fi < frames.length; fi++) {
          if (globalBit < cumBits + frames[fi].bits.length) {
            setFIdx(fi);
            setBIdx(globalBit - cumBits);
            break;
          }
          cumBits += frames[fi].bits.length;
        }
        globalBit = (globalBit + 1) % totalBits;
      }, bitDuration);
      return () => clearInterval(timer);
    }, [playing, frames, speed]);

    return (
      <div style={{ background: "rgba(0,0,0,0.2)", padding: 16, borderRadius: 12, border: "1px solid #1a3a3a" }}>
        <BitFrameDisplay frame={frames[fIdx]} activeBit={bIdx} playing={playing} />
        <div style={{ marginTop: 10, textAlign: "center", fontSize: 10, color: "#4a6a5a" }}>
          Frame {fIdx + 1} / {frames.length} — Bit {bIdx}
        </div>
      </div>
    );
  }

  // Main sample timer
  useEffect(() => {
    if (!playing) {
      clearInterval(timerRef.current);
      return;
    }
    const interval = Math.max(500, 2000 / speed);
    timerRef.current = setInterval(generateSample, interval);
    generateSample();
    return () => clearInterval(timerRef.current);
  }, [playing, speed, generateSample]);

  const toggleSensor = (key) => {
    setActiveSensors((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleAddSensorFromLibrary = (s, isLibrary) => {
    let key = isLibrary ? s.name : s.name.toUpperCase().replace(/\s/g, "_");
    let finalKey = key;
    let num = 2;
    while (sensors[finalKey]) {
      finalKey = `${key}_${num++}`;
    }
    const newSensor = { ...s, name: finalKey };
    if (!isLibrary) {
      newSensor.label = s.label || s.name;
    }
    setSensors((prev) => ({ ...prev, [finalKey]: newSensor }));
    setActiveSensors((prev) => [...prev, finalKey]);
    setShowAddSensor(false);
  };

  const removeSensor = (key) => {
    const s = sensors[key];
    console.log("Removing sensor:", key);
    setSensors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setActiveSensors((prev) => prev.filter((k) => k !== key));
    setSensorHistories((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setTrace(prev => [...prev.slice(-99), { 
      time: timeStr(), 
      type: "sys", 
      text: `Kayıt kaldırıldı: ${s?.label || key}`, 
      color: "#ff4757" 
    }]);
  };

  const cloneSensor = (key) => {
    const base = sensors[key];
    if (!base) return;
    let newNum = 2;
    let newKey = `${key}_${newNum}`;
    while (sensors[newKey]) {
      newNum++;
      newKey = `${key}_${newNum}`;
    }
    const cloned = { ...base, name: newKey, label: `${base.label || base.name} (${newNum})` };
    setSensors((prev) => ({ ...prev, [newKey]: cloned }));
    setActiveSensors((prev) => [...prev, newKey]);
  };

  const clearWorkspace = () => {
    if (Object.keys(sensors).length === 0) return;
    if (window.confirm("Tüm sensörleri çalışma alanından kaldırmak istediğinize emin misiniz? (Kütüphaneden dilediğiniz zaman geri ekleyebilirsiniz)")) {
      setSensors({});
      setActiveSensors([]);
      setSensorHistories({});
    }
  };

  const exportWorkspace = () => {
    const data = JSON.stringify({ sensors, activeSensors }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `uart_workspace_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const moveSensor = (key, direction) => {
    // 1. activeSensors dizisini güncelle (Osiloskop sırası)
    setActiveSensors((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });

    // 2. sensors objesinin ana sırasını güncelle (Sidebar sırası)
    setSensors((prev) => {
      const keys = Object.keys(prev);
      const idx = keys.indexOf(key);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= keys.length) return prev;
      
      const newKeys = [...keys];
      [newKeys[idx], newKeys[newIdx]] = [newKeys[newIdx], newKeys[idx]];
      
      const next = {};
      newKeys.forEach(k => { next[k] = prev[k]; });
      return next;
    });
  };

  const importWorkspace = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const payload = JSON.parse(ev.target.result);
        if (window.confirm("Mevcut çalışma alanınız temizlenecek ve JSON dosyasındaki veriler yüklenecek. Onaylıyor musunuz?")) {
          const importedSensors = payload.sensors || {};
          // Re-attach functions
          Object.keys(importedSensors).forEach(k => {
            const s = importedSensors[k];
            const baseKey = s.baseType || k.replace(/_\d+$/, "");
            const base = SENSOR_REGISTRY[baseKey];
            if (base) {
              s.generate = base.generate;
              s.encodeBytes = base.encodeBytes;
            }
          });
          setSensors(importedSensors);
          setActiveSensors(payload.activeSensors || []);
          setSensorHistories({});
        }
      } catch (err) {
        alert("JSON dosyası okunamadı veya geçersiz format!");
      }
    };
    reader.readAsText(file);
    e.target.value = null; 
  };

  // Gerçek seri porttan gelen parse edilmiş veriyi simülatöre besle
  const handleSerialPacket = useCallback(({ key, value }) => {
    const s = sensorsRef.current[key] || { 
      name: key, label: key, unit: "", icon: "📡", color: "#00bcd4" 
    };
    
    setTrace(prev => [
      ...prev.slice(-199),
      { time: timeStr(), type: "rx", text: `[UART] ${s.label}: ${typeof value === "number" ? value.toFixed(2) : value}`, color: s.color }
    ]);
  }, []);

  const serialLog = useCallback((log) => {
    setTrace(prev => [
      ...prev.slice(-199), 
      { time: timeStr(), type: "sys", text: log.text, color: log.color }
    ]);
  }, []);

  const handleSerialRaw = useCallback((data, type) => {
    const text = new TextDecoder().decode(data);
    const hex = toHex(data);
    setTrace(prev => [
      ...prev.slice(-199),
      { time: timeStr(), type, text, hex }
    ]);

    if (type === "rx") {
      if (echoEnabled) setTimeout(() => sendSerial(data), 20);
      const rxText = text.trim();
      const rule = responseRules.find(r => r.enabled && rxText.includes(r.trigger));
      if (rule) setTimeout(() => sendSerial(rule.response), 50);
    }
  }, [echoEnabled, responseRules]);

  const { connected: serialConnected, supported: serialSupported, connect: serialConnect, disconnect: serialDisconnect, send: sendSerial } = useSerialPort({
    protocol: serialProtocol,
    onPacket: handleSerialPacket,
    onLog: serialLog,
    onRaw: handleSerialRaw,
  });

  const onManualSend = (data) => {
    sendSerial(data);
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    setTrace(prev => [...prev.slice(-199), { 
      time: timeStr(), 
      type: "tx", 
      text: text.trim(), 
      hex: toHex(data) 
    }]);
  };

  const resetAll = useCallback(() => {
    setPlaying(false);
    setSensorHistories({});
    setCurrentFrames([]);
    setTrace([]);
    setTransmittedCount(0);
    setErrorCount(0);
    setThroughput(0);
  }, []);

  // Responsive container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.max(320, Math.floor(entry.contentRect.width) - 48));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard shortcuts: Space = play/pause, R = reset
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (e.code === "KeyR" && !e.ctrlKey && !e.metaKey) {
        resetAll();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resetAll]);

  const font = '"IBM Plex Mono", "Fira Code", monospace';

  const tabs = [
    { key: "osiloskop", label: "📡 Osiloskop" },
    { key: "terminal", label: "🖥 İzleme & Terminal" },
    { key: "firmware", label: "💻 Firmware" },
  ];

  return (
    <div ref={containerRef} style={{
      boxSizing: "border-box",
      background: "linear-gradient(180deg, #020408 0%, #0a121d 100%)",
      height: "100vh",
      overflow: "hidden",
      color: "#c0d8cc",
      fontFamily: font,
      display: "grid",
      gridTemplateColumns: "380px 1fr",
      gridTemplateRows: "auto 1fr",
      gridTemplateAreas: `
        "header header"
        "sidebar main"
      `,
      gap: 10,
      padding: "10px 16px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6, background: "#00ff8815",
            border: "1px solid #00ff8844", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>⚡</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#00ff88", letterSpacing: 1, lineHeight: 1.2 }}>
              UART SİMÜLATÖR
            </h1>
            <div style={{ fontSize: 9, color: "#3a5a4a", letterSpacing: 1 }}>
              SENSÖR TEST PLATFORMU v2.0
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 10, color: "#4a6a5a", flexWrap: "wrap" }}>
          <span>TX: <span style={{ color: "#00ff88" }}>{transmittedCount}</span></span>
          <span>
            ERR: <span style={{ color: errorCount > 0 ? "#ff4757" : "#4a6a5a" }}>{errorCount}</span>
            {transmittedCount > 0 && (
              <span style={{ color: "#4a6a5a" }}> ({(errorCount / transmittedCount * 100).toFixed(1)}%)</span>
            )}
          </span>
          {throughput > 0 && (
            <span>BPS: <span style={{ color: "#ffd93d" }}>{throughput}</span></span>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", display: "inline-block",
              background: serialConnected ? "#00ff88" : "#2a3a32",
              boxShadow: serialConnected ? "0 0 6px #00ff88" : "none",
            }} />
            <span style={{ color: serialConnected ? "#00ff88" : "#2a3a32" }}>
              {serialConnected ? "SERIAL" : "SIM"}
            </span>
          </span>
        </div>
      </div>

      <div style={{
        gridArea: "sidebar",
        display: "flex", flexDirection: "column", gap: 12,
        overflowY: "auto", paddingRight: 4,
        paddingBottom: 24,
      }}>
      {/* Control Bar */}
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        padding: 12, background: "#0c1219", borderRadius: 10, border: "1px solid #1a2a22",
        marginBottom: 12,
      }}>
        <button
          onClick={() => setPlaying(!playing)}
          style={{
            padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer",
            fontFamily: font, fontWeight: 700, fontSize: 13, letterSpacing: 1,
            background: playing
              ? "linear-gradient(135deg, #ff4757, #c0392b)"
              : "linear-gradient(135deg, #00ff88, #00cc6a)",
            color: playing ? "#fff" : "#0a0e14",
            boxShadow: playing ? "0 0 20px #ff475744" : "0 0 20px #00ff8844",
          }}
        >
          {playing ? "⏹ DURDUR" : "▶ BAŞLAT"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#4a6a5a" }}>HIZ</span>
          {[0.5, 1, 2, 4].map((s) => (
            <button key={s} onClick={() => setSpeed(s)} style={{
              padding: "4px 10px", borderRadius: 4, border: "1px solid",
              borderColor: speed === s ? "#00ff88" : "#1a2a22",
              background: speed === s ? "#00ff8822" : "transparent",
              color: speed === s ? "#00ff88" : "#4a6a5a",
              cursor: "pointer", fontFamily: font, fontSize: 11,
            }}>{s}x</button>
          ))}
        </div>

        <div style={{ width: 1, height: 28, background: "#1a2a22", margin: "0 4px" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#4a6a5a" }}>BAUD</span>
          <select value={baudRate} onChange={(e) => setBaudRate(Number(e.target.value))} style={{
            background: "#0d1520", border: "1px solid #1a3a2a", borderRadius: 4,
            color: "#00ff88", padding: "4px 8px", fontFamily: font, fontSize: 12, cursor: "pointer",
          }}>
            {BAUD_RATES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#4a6a5a" }}>PARİTE</span>
          <select value={parity} onChange={(e) => setParity(e.target.value)} style={{
            background: "#0d1520", border: "1px solid #1a3a2a", borderRadius: 4,
            color: "#a29bfe", padding: "4px 8px", fontFamily: font, fontSize: 12, cursor: "pointer",
          }}>
            {Object.entries(PARITY_MODES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#4a6a5a" }}>STOP</span>
          {[1, 2].map((s) => (
            <button key={s} onClick={() => setStopBits(s)} style={{
              padding: "4px 10px", borderRadius: 4, border: "1px solid",
              borderColor: stopBits === s ? "#ffd93d" : "#1a2a22",
              background: stopBits === s ? "#ffd93d22" : "transparent",
              color: stopBits === s ? "#ffd93d" : "#4a6a5a",
              cursor: "pointer", fontFamily: font, fontSize: 11,
            }}>{s}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 28, background: "#1a2a22", margin: "0 4px" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#4a6a5a" }}>HATA</span>
          {[
            { key: null, label: "Yok", color: "#4a6a5a" },
            { key: "parity", label: "Parity", color: "#ff6b6b" },
            { key: "framing", label: "Framing", color: "#ff9f43" },
          ].map((e) => (
            <button key={String(e.key)} onClick={() => setErrorMode(e.key)} style={{
              padding: "4px 10px", borderRadius: 4, border: "1px solid",
              borderColor: errorMode === e.key ? e.color : "#1a2a22",
              background: errorMode === e.key ? `${e.color}22` : "transparent",
              color: errorMode === e.key ? e.color : "#4a6a5a",
              cursor: "pointer", fontFamily: font, fontSize: 11,
            }}>{e.label}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 28, background: "#1a2a22", margin: "0 4px" }} />

        <button onClick={resetAll} title="Sıfırla (R tuşu)" style={{
          padding: "4px 14px", borderRadius: 4, border: "1px solid #2a3a4a",
          background: "transparent", color: "#4a6a7a",
          cursor: "pointer", fontFamily: font, fontSize: 11,
        }}>↺ Sıfırla</button>
      </div>

      {/* Serial Port Panel */}
      <SerialPanel
        connected={serialConnected}
        supported={serialSupported}
        protocol={serialProtocol}
        setProtocol={setSerialProtocol}
        baudRate={baudRate}
        onConnect={serialConnect}
        onDisconnect={serialDisconnect}
        font={font}
        echoEnabled={echoEnabled}
        setEchoEnabled={setEchoEnabled}
      />

      {/* Workspace Sensors List */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#3a5a4a", letterSpacing: 2, fontWeight: 700 }}>ÇALIŞMA ALANI</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
             <button onClick={exportWorkspace} title="Dışa Aktar (JSON)" style={{ background: "rgba(0,255,136,0.05)", border: "1px solid #00ff8844", color: "#00ff88", padding: "4px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center" }}>💾</button>
             <label title="İçe Aktar (JSON)" style={{ background: "rgba(0,255,136,0.05)", border: "1px solid #00ff8844", color: "#00ff88", padding: "4px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center" }}>
                📂 <input type="file" accept=".json" onChange={importWorkspace} style={{ display: "none" }} />
             </label>
             <button onClick={clearWorkspace} title="Tümünü Sil" style={{
               background: "#ff475715", border: "1px solid #ff475744", color: "#ff4757",
               padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer",
               visibility: Object.keys(sensors).length > 0 ? "visible" : "hidden"
             }}>🗑</button>
          </div>
        </div>

        {/* Quick Add (Autocomplete) */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, opacity: 0.5 }}>⚡</div>
          <input 
            type="text" 
            placeholder="Hızlı sensör bul..."
            onChange={(e) => {
              const val = e.target.value.toLowerCase();
              if (val.length < 1) { setQuickResults([]); return; }
              const matches = Object.keys(SENSOR_REGISTRY).filter(k => 
                SENSOR_REGISTRY[k].label.toLowerCase().includes(val) || SENSOR_REGISTRY[k].name.toLowerCase().includes(val)
              ).slice(0, 5);
              setQuickResults(matches);
            }}
            onBlur={() => setTimeout(() => setQuickResults([]), 200)}
            style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid #1a2a22", padding: "8px 12px 8px 30px", borderRadius: 8, color: "#fff", fontSize: 11, fontFamily: font, outline: "none", transition: "all 0.2s" }}
          />
          {quickResults.length > 0 && (
            <div style={{ position: "absolute", top: "105%", left: 0, right: 0, background: "#0d1624", border: "1px solid #1a3a3a", borderRadius: 10, zIndex: 100, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.6)" }}>
              {quickResults.map(k => {
                const s = SENSOR_REGISTRY[k];
                return (
                  <div key={k} onClick={() => { handleAddSensorFromLibrary(s, true); setQuickResults([]); }} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #1a3a3a", display: "flex", alignItems: "center", gap: 10, transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,136,0.08)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <div style={{ flex: 1 }}>
                       <div style={{ fontSize: 12, color: "#fff", fontWeight: 700 }}>{s.label}</div>
                       <div style={{ fontSize: 9, color: "#4a6a5a" }}>{s.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Active Group */}
          {Object.entries(sensors).filter(([k]) => activeSensors.includes(k)).length > 0 && (
            <div style={{ fontSize: 9, color: "#00ff88", marginBottom: 4, opacity: 0.6 }}>● AKTİF</div>
          )}
          {Object.entries(sensors).filter(([k]) => activeSensors.includes(k)).map(([key, s], idx, arr) => (
            <SensorListItem 
              key={key} sensor={s} pKey={key} isActive={true} 
              onToggle={toggleSensor} onClone={cloneSensor} onRemove={removeSensor} onMove={moveSensor}
              isFirst={idx === 0} isLast={idx === arr.length - 1}
            />
          ))}

          {/* Standby Group */}
          {Object.entries(sensors).filter(([k]) => !activeSensors.includes(k)).length > 0 && (
            <div style={{ fontSize: 9, color: "#4a6a5a", marginTop: 10, marginBottom: 4, opacity: 0.6 }}>○ BEKLEMEDE</div>
          )}
          {Object.entries(sensors).filter(([k]) => !activeSensors.includes(k)).map(([key, s], idx, arr) => (
            <SensorListItem 
              key={key} sensor={s} pKey={key} isActive={false} 
              onToggle={toggleSensor} onClone={cloneSensor} onRemove={removeSensor} onMove={moveSensor}
              isFirst={idx === 0} isLast={idx === arr.length - 1}
            />
          ))}

          {Object.keys(sensors).length === 0 && (
            <div style={{ padding: "20px 0", textAlign: "center", color: "#2a3a32", fontSize: 12, border: "1px dashed #1a2a22", borderRadius: 10 }}>
              Henüz sensör eklenmedi.
            </div>
          )}

          <button onClick={() => setShowAddSensor(true)} style={{
            padding: "12px", borderRadius: 10, border: "1px dashed #00ff8844",
            background: "rgba(0,255,136,0.05)", color: "#00ff88", cursor: "pointer",
            fontFamily: font, fontSize: 12, fontWeight: 800, marginTop: 8,
            transition: "all 0.2s", letterSpacing: 0.5
          }}>+ SENSOR HUB'DAN EKLE</button>
        </div>
      </div>

      {/* Sensor mini-graphs */}
      {activeSensors.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {activeSensors.map((key) => {
            const s = sensors[key];
            if (!s) return null;
            return (
              <div key={key} style={{
                background: "#0c1219", borderRadius: 8, padding: 8,
                border: `1px solid ${s.color}33`,
              }}>
                <div style={{ fontSize: 10, color: s.color, marginBottom: 4 }}>
                  {s.icon} {s.label || s.name}
                </div>
                <SensorGraph
                  history={sensorHistories[key] || []}
                  sensor={s}
                  width={220}
                  height={70}
                />
              </div>
            );
          })}
        </div>
      )}

      </div>

      <div style={{
        gridArea: "main",
        display: "flex", flexDirection: "column", gap: 12,
        overflow: "hidden", paddingLeft: 4,
        paddingBottom: 24, height: "100%"
      }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 16px", borderRadius: "8px 8px 0 0",
            border: "1px solid", borderBottom: "none",
            borderColor: tab === t.key ? "#1a3a2a" : "transparent",
            background: tab === t.key ? "#0c1219" : "transparent",
            color: tab === t.key ? "#00ff88" : "#3a5a4a",
            cursor: "pointer", fontFamily: font, fontSize: 12, fontWeight: 600,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{
        background: "#0c1219", borderRadius: "0 8px 8px 8px", border: "1px solid #1a2a22",
        padding: 16, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden"
      }}>
        {tab === "osiloskop" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {currentFrames.length > 0 ? (
              <UartBitPlayer frames={currentFrames} playing={playing} speed={speed} font={font} />
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "#2a3a32", border: "1px dashed #1a2a22", borderRadius: 12 }}>
                Simülasyonu başlatın — veriler burada görselleştirilecek
              </div>
            )}
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
               {activeSensors.map(k => {
                 const s = sensors[k];
                 const val = sensorHistories[k]?.slice(-1)[0];
                 return (
                   <div key={k} style={{ padding: 12, background: "#0a1118", borderRadius: 10, borderLeft: `3px solid ${s?.color || "#444"}` }}>
                      <div style={{ fontSize: 10, color: "#4a6a5a" }}>{s?.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{s?.icon} {typeof val === "number" ? val.toFixed(1) : "0.0"}</div>
                   </div>
                 );
               })}
            </div>
          </div>
        )}

        {tab === "terminal" && <Terminal history={trace} onSend={onManualSend} onClear={() => setTrace([])} font={font} />}
        
        {tab === "firmware" && <FirmwareTab font={font} />}
      </div>

      {/* Footer / Info */}
      <div style={{
        marginTop: 12, padding: 10, background: "#081018", borderRadius: 8,
        border: "1px solid #1a2a3a", fontSize: 11, color: "#4a6a5a",
        display: "flex", gap: 20, flexWrap: "wrap",
      }}>
        <span>Frame: <span style={{ color: "#00ff88" }}>1 Start + 8 Data{parity !== "none" ? " + 1 Parity" : ""} + {stopBits} Stop</span></span>
        <span>Bit Süresi: <span style={{ color: "#ffd93d" }}>{((1 / baudRate) * 1e6).toFixed(2)} µs</span></span>
        <span>Aktif Sensör: <span style={{ color: "#ff6b6b" }}>{activeSensors.length}</span></span>
      </div>
    </div>

    {showAddSensor && (
      <SensorLibraryModal onAdd={handleAddSensorFromLibrary} onClose={() => setShowAddSensor(false)} font={font} />
    )}
  </div>
);
}

// ── Supporting Components ────────────────────

