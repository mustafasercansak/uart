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
};

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

const PARITY_MODES = {
  none: { label: "Yok", calc: () => null },
  even: { label: "Çift", calc: (bits) => bits.reduce((a, b) => a ^ b, 0) },
  odd: { label: "Tek", calc: (bits) => bits.reduce((a, b) => a ^ b, 0) ^ 1 },
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
      };
      const raw = (buf[2] << 8) | buf[3];
      const entry = BINARY_MAP[buf[1]];
      return entry
        ? { key: entry.key, value: raw * entry.scale }
        : { key: `SENSOR_${buf[1].toString(16).toUpperCase().padStart(2, "0")}`, value: raw };
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
        const color = frame.hasError ? "#ff4757" : frame.bits === undefined ? "#00ff88" : "#00ff88";
        const alpha = playing ? (isPast || isActive ? 1 : 0.2) : 0.8;

        // Signal line
        ctx.strokeStyle = frame.hasError && isActive
          ? `rgba(255, 71, 87, ${alpha})`
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
          gctx.shadowColor = frame.hasError ? "#ff4757" : "#00ff88";
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
      <canvas ref={canvasRef} style={{ width, height, display: "block" }} />
      <canvas
        ref={glowRef}
        style={{ width, height, position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
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

    ctx.strokeStyle = sensor.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = sensor.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    history.forEach((val, i) => {
      const x = (i / (history.length - 1)) * width;
      const y = pad + ((sensor.max - val) / range) * (height - 2 * pad);
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

// ── Bit Frame Display ───────────────────────
function BitFrameDisplay({ frame, activeBit, playing }) {
  return (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
      {frame.bits.map((bit, i) => {
        const isStart = i === 0;
        const label = frame.labels[i];
        const isActive = playing && i === activeBit;
        const isError =
          (frame.errorType === "parity" && label === "PAR") ||
          (frame.errorType === "framing" && label === "STOP");

        let bg = bit === 1 ? "#1a3a2a" : "#1a1a2a";
        let border = bit === 1 ? "#00ff8844" : "#4466ff44";
        let fg = bit === 1 ? "#00ff88" : "#6688ff";

        if (isActive) { bg = "#2a4a3a"; border = "#00ff88"; }
        if (isError) { bg = "#3a1a1a"; border = "#ff4757"; fg = "#ff4757"; }

        return (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "4px 6px",
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 4,
              minWidth: 32,
              transition: "all 0.15s",
              transform: isActive ? "scale(1.15)" : "scale(1)",
              boxShadow: isActive ? `0 0 12px ${isError ? "#ff475766" : "#00ff8844"}` : "none",
            }}
          >
            <span style={{ fontSize: 9, color: "#6a8a7a", fontFamily: '"IBM Plex Mono", monospace' }}>
              {label}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: fg,
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              {bit}
            </span>
          </div>
        );
      })}
      <span style={{
        fontSize: 11,
        color: "#5a7a6a",
        marginLeft: 8,
        fontFamily: '"IBM Plex Mono", monospace',
      }}>
        0x{frame.byte.toString(16).toUpperCase().padStart(2, "0")}
      </span>
      {frame.hasError && (
        <span style={{
          fontSize: 10,
          color: "#ff4757",
          marginLeft: 4,
          padding: "2px 6px",
          background: "#3a1a1a",
          borderRadius: 4,
          fontFamily: '"IBM Plex Mono", monospace',
        }}>
          ⚠ {frame.errorType === "parity" ? "Parity Hatası" : "Framing Hatası"}
        </span>
      )}
    </div>
  );
}

// ── Baud Rate Comparison ────────────────────
function BaudRateComparison({ byte, parity }) {
  const canvasRef = useRef(null);
  const w = 680, h = 200;

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
      style={{ width: w, height: h, display: "block", borderRadius: 8, border: "1px solid #1a2a22" }}
    />
  );
}

// ── Custom Sensor Modal ─────────────────────
function CustomSensorForm({ onAdd, onClose }) {
  const [form, setForm] = useState({
    name: "", label: "", unit: "", icon: "📟",
    min: 0, max: 100, color: "#00ff88",
  });

  const handleSubmit = () => {
    if (!form.name || !form.label) return;
    onAdd({
      ...form,
      min: Number(form.min),
      max: Number(form.max),
      resolution: 0.01,
      generate: (t) => {
        const mid = (Number(form.max) + Number(form.min)) / 2;
        const amp = (Number(form.max) - Number(form.min)) * 0.3;
        return mid + amp * Math.sin(t * 0.2) + (Math.random() - 0.5) * amp * 0.1;
      },
      encodeBytes: (val) => {
        const raw = Math.round(val * 100);
        return [(raw >> 8) & 0xff, raw & 0xff];
      },
    });
  };

  const inputStyle = {
    background: "#0d1520",
    border: "1px solid #1a3a2a",
    borderRadius: 4,
    color: "#c0d8cc",
    padding: "6px 10px",
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: 13,
    outline: "none",
    width: "100%",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: "#0f1923", border: "1px solid #1a3a2a", borderRadius: 12,
        padding: 24, width: 380, color: "#c0d8cc",
      }}>
        <h3 style={{ margin: "0 0 16px", fontFamily: '"IBM Plex Mono", monospace', color: "#00ff88" }}>
          + Yeni Sensör Ekle
        </h3>
        {[
          { key: "name", ph: "Ör: SHT31", lbl: "Sensör Kodu" },
          { key: "label", ph: "Ör: Nem & Sıcaklık", lbl: "Etiket" },
          { key: "unit", ph: "Ör: %RH", lbl: "Birim" },
          { key: "icon", ph: "📟", lbl: "İkon (emoji)" },
        ].map(({ key, ph, lbl }) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "#5a7a6a", display: "block", marginBottom: 3 }}>{lbl}</label>
            <input
              style={inputStyle}
              placeholder={ph}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "#5a7a6a", display: "block", marginBottom: 3 }}>Min</label>
            <input style={inputStyle} type="number" value={form.min}
              onChange={(e) => setForm((f) => ({ ...f, min: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "#5a7a6a", display: "block", marginBottom: 3 }}>Max</label>
            <input style={inputStyle} type="number" value={form.max}
              onChange={(e) => setForm((f) => ({ ...f, max: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "#5a7a6a", display: "block", marginBottom: 3 }}>Renk</label>
            <input type="color" value={form.color} style={{ ...inputStyle, padding: 2, height: 34, cursor: "pointer" }}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={handleSubmit} style={{
            flex: 1, padding: "8px 0", background: "#00ff8822", border: "1px solid #00ff88",
            borderRadius: 6, color: "#00ff88", cursor: "pointer",
            fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600,
          }}>Ekle</button>
          <button onClick={onClose} style={{
            flex: 1, padding: "8px 0", background: "#1a1a2a", border: "1px solid #333",
            borderRadius: 6, color: "#888", cursor: "pointer",
            fontFamily: '"IBM Plex Mono", monospace',
          }}>İptal</button>
        </div>
      </div>
    </div>
  );
}

// ── Web Serial Hook ──────────────────────────
// Desteklenen protokoller: ascii | json | binary
// onPacket({ key, value }) — parse edilen her veri noktası
// onLog({ text, color })   — bağlantı/hata mesajları
function useSerialPort({ protocol, onPacket, onLog }) {
  const [connected, setConnected] = useState(false);
  const [supported] = useState(() => "serial" in navigator);
  const portRef   = useRef(null);
  const readerRef = useRef(null);

  const disconnect = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch { /* port zaten kapalı olabilir */ }
    setConnected(false);
    onLog({ text: "Seri port bağlantısı kesildi.", color: "#ff9f43" });
  }, [onLog]);

  const connect = useCallback(async (baudRate) => {
    if (!supported) return;
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });
      portRef.current = port;
      setConnected(true);
      onLog({ text: `Bağlandı — ${baudRate} baud, protokol: ${protocol.toUpperCase()}`, color: "#00ff88" });

      const reader = port.readable.getReader();
      readerRef.current = reader;
      const dec = new TextDecoder();
      let lineBuf = "";
      let binBuf  = [];

      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            if (protocol === "binary") {
              // value → Uint8Array; paket = [0xAA][id][hi][lo][xor]
              for (const byte of value) {
                if (byte === 0xAA) { binBuf = [byte]; }
                else if (binBuf.length > 0) {
                  binBuf.push(byte);
                  if (binBuf.length === 5) {
                    const parsed = PROTOCOLS.binary.parsePacket(binBuf);
                    if (parsed) onPacket(parsed);
                    else onLog({ text: `Binary checksum hatası: [${binBuf.map((b) => "0x" + b.toString(16).padStart(2, "0")).join(" ")}]`, color: "#ff4757" });
                    binBuf = [];
                  }
                }
              }
            } else {
              // ASCII veya JSON — satır bazlı
              lineBuf += dec.decode(value, { stream: true });
              const lines = lineBuf.split(/\r?\n/);
              lineBuf = lines.pop();
              for (const line of lines) {
                if (!line.trim()) continue;
                const parsed = PROTOCOLS[protocol].parse(line);
                if (parsed) onPacket(parsed);
                else onLog({ text: `[RAW] ${line}`, color: "#3a5a4a" });
              }
            }
          }
        } catch (e) {
          if (e.name !== "AbortError") onLog({ text: `Okuma hatası: ${e.message}`, color: "#ff4757" });
        } finally {
          reader.releaseLock();
          setConnected(false);
        }
      })();
    } catch (e) {
      if (e.name !== "NotFoundError") onLog({ text: `Bağlantı hatası: ${e.message}`, color: "#ff4757" });
    }
  }, [supported, protocol, onPacket, onLog]);

  // Temizlik
  useEffect(() => () => { disconnect(); }, [disconnect]);

  return { connected, supported, connect, disconnect };
}

// ── Log Panel ───────────────────────────────
function LogPanel({ logs }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <div ref={ref} style={{
      background: "#080c12", borderRadius: 8, border: "1px solid #1a2a22",
      padding: 10, height: 140, overflowY: "auto", fontFamily: '"IBM Plex Mono", monospace',
      fontSize: 11,
    }}>
      {logs.map((log, i) => (
        <div key={i} style={{ color: log.color || "#5a8a6a", marginBottom: 2, lineHeight: 1.4 }}>
          <span style={{ color: "#3a5a4a" }}>[{log.time}]</span>{" "}
          <span style={{ color: log.sensor?.color || "#5a8a6a" }}>{log.sensor?.icon || "•"}</span>{" "}
          {log.text}
        </div>
      ))}
      {logs.length === 0 && (
        <div style={{ color: "#2a3a32", fontStyle: "italic" }}>Simülasyon başlatılmadı...</div>
      )}
    </div>
  );
}

// ── Serial Panel ─────────────────────────────
function SerialPanel({ connected, supported, protocol, setProtocol, baudRate, onConnect, onDisconnect, font }) {
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

// ══════════════════════════════════════════════
// ANA BİLEŞEN
// ══════════════════════════════════════════════
export default function UartSimulator() {
  const [sensors, setSensors] = useState(SENSOR_REGISTRY);
  const [activeSensors, setActiveSensors] = useState(["DS18B20", "DHT22"]);
  const [baudRate, setBaudRate] = useState(9600);
  const [parity, setParity] = useState("none");
  const [stopBits, setStopBits] = useState(1);
  const [errorMode, setErrorMode] = useState(null); // null | "parity" | "framing"
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState("osiloskop"); // osiloskop | baudKarsilastirma | log

  const [sensorHistories, setSensorHistories] = useState({});
  const [currentFrames, setCurrentFrames] = useState([]);
  const [activeFrameIdx, setActiveFrameIdx] = useState(0);
  const [activeBitIdx, setActiveBitIdx] = useState(0);
  const [logs, setLogs] = useState([]);
  const [tick, setTick] = useState(0);
  const [showAddSensor, setShowAddSensor] = useState(false);
  const [transmittedCount, setTransmittedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const [serialProtocol, setSerialProtocol] = useState("ascii");

  const timerRef = useRef(null);
  const tickRef = useRef(0);

  const timeStr = () => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`;
  };

  const generateSample = useCallback(() => {
    const t = tickRef.current;
    tickRef.current += 0.1;

    const newHistories = { ...sensorHistories };
    const frames = [];
    const newLogs = [];

    activeSensors.forEach((sKey) => {
      const s = sensors[sKey];
      if (!s) return;
      const val = Math.max(s.min, Math.min(s.max, s.generate(t)));
      const bytes = s.encodeBytes(val);

      if (!newHistories[sKey]) newHistories[sKey] = [];
      newHistories[sKey] = [...newHistories[sKey].slice(-59), val];

      // Apply error injection randomly (20% chance per frame when enabled)
      bytes.forEach((b, bi) => {
        const inject = errorMode && Math.random() < 0.2 ? errorMode : null;
        const frame = buildUartFrame(b, parity, stopBits, inject);
        frames.push(frame);
        if (inject) {
          newLogs.push({
            time: timeStr(),
            sensor: s,
            text: `⚠ ${inject === "parity" ? "PARITY" : "FRAMING"} HATASI — 0x${b.toString(16).toUpperCase().padStart(2, "0")}`,
            color: "#ff4757",
          });
        }
      });

      newLogs.push({
        time: timeStr(),
        sensor: s,
        text: `${s.label}: ${val.toFixed(3)} ${s.unit} → [${bytes.map((b) => "0x" + b.toString(16).toUpperCase().padStart(2, "0")).join(", ")}]`,
        color: s.color,
      });
    });

    setSensorHistories(newHistories);
    setCurrentFrames(frames);
    setActiveFrameIdx(0);
    setActiveBitIdx(0);
    setTransmittedCount((c) => c + frames.length);
    setErrorCount((c) => c + frames.filter((f) => f.hasError).length);
    setLogs((prev) => [...prev.slice(-200), ...newLogs]);
    setTick((t) => t + 1);
  }, [activeSensors, sensors, sensorHistories, errorMode, parity, stopBits]);

  // Bit-level animation
  useEffect(() => {
    if (!playing || currentFrames.length === 0) return;
    const totalBits = currentFrames.reduce((a, f) => a + f.bits.length, 0);
    const bitDuration = Math.max(30, 600 / (speed * totalBits));

    let globalBit = 0;
    const timer = setInterval(() => {
      let cumBits = 0;
      for (let fi = 0; fi < currentFrames.length; fi++) {
        if (globalBit < cumBits + currentFrames[fi].bits.length) {
          setActiveFrameIdx(fi);
          setActiveBitIdx(globalBit - cumBits);
          break;
        }
        cumBits += currentFrames[fi].bits.length;
      }
      globalBit++;
      if (globalBit >= totalBits) {
        globalBit = 0;
      }
    }, bitDuration);

    return () => clearInterval(timer);
  }, [playing, currentFrames, speed]);

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

  const handleAddCustomSensor = (s) => {
    const key = s.name.toUpperCase().replace(/\s/g, "_");
    setSensors((prev) => ({ ...prev, [key]: { ...s, name: key } }));
    setShowAddSensor(false);
  };

  // Gerçek seri porttan gelen parse edilmiş veriyi simülatöre besle
  const handleSerialPacket = useCallback(({ key, value }) => {
    const s = sensors[key] || {
      name: key, label: key, unit: "", icon: "📡",
      color: "#00bcd4", min: -Infinity, max: Infinity,
      encodeBytes: (v) => {
        const raw = Math.round(Math.abs(v) * 100) & 0xffff;
        return [(raw >> 8) & 0xff, raw & 0xff];
      },
    };
    const bytes = s.encodeBytes(value);
    const frames = bytes.map((b) => buildUartFrame(b, parity, stopBits));
    setSensorHistories((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []).slice(-59), value],
    }));
    setCurrentFrames(frames);
    setActiveFrameIdx(0);
    setActiveBitIdx(0);
    setTransmittedCount((c) => c + frames.length);
    setLogs((prev) => [
      ...prev.slice(-200),
      {
        time: timeStr(),
        sensor: s,
        text: `[SERIAL] ${s.label}: ${typeof value === "number" ? value.toFixed(3) : value} ${s.unit} → [${bytes.map((b) => "0x" + b.toString(16).toUpperCase().padStart(2, "0")).join(", ")}]`,
        color: s.color,
      },
    ]);
  }, [sensors, parity, stopBits]);

  const serialLog = useCallback((log) => {
    setLogs((prev) => [...prev.slice(-200), { time: timeStr(), sensor: null, ...log }]);
  }, []);

  const { connected: serialConnected, supported: serialSupported, connect: serialConnect, disconnect: serialDisconnect } = useSerialPort({
    protocol: serialProtocol,
    onPacket: handleSerialPacket,
    onLog: serialLog,
  });

  const font = '"IBM Plex Mono", "Fira Code", monospace';

  const tabs = [
    { key: "osiloskop",        label: "📡 Osiloskop" },
    { key: "baudKarsilastirma",label: "⚡ Baud Karşılaştırma" },
    { key: "log",              label: "📋 İletim Logu" },
    { key: "firmware",         label: "💻 Firmware" },
    { key: "kullanim",         label: "📖 Kullanım" },
  ];

  return (
    <div style={{
      background: "linear-gradient(180deg, #080c12 0%, #0a1018 100%)",
      minHeight: "100vh",
      color: "#c0d8cc",
      fontFamily: font,
      padding: "16px 20px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: "#00ff8815",
            border: "1px solid #00ff8844", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>⚡</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#00ff88", letterSpacing: 1 }}>
              UART SİMÜLATÖR
            </h1>
            <div style={{ fontSize: 10, color: "#3a5a4a", letterSpacing: 2 }}>
              SENSÖR TEST PLATFORMU v1.0
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11, color: "#4a6a5a" }}>
          <span>TX: <span style={{ color: "#00ff88" }}>{transmittedCount}</span></span>
          <span>ERR: <span style={{ color: errorCount > 0 ? "#ff4757" : "#4a6a5a" }}>{errorCount}</span></span>
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
      />

      {/* Sensor Selection */}
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center",
      }}>
        {Object.entries(sensors).map(([key, s]) => (
          <button key={key} onClick={() => toggleSensor(key)} style={{
            padding: "6px 14px", borderRadius: 20, border: "1px solid",
            borderColor: activeSensors.includes(key) ? s.color : "#1a2a22",
            background: activeSensors.includes(key) ? `${s.color}18` : "transparent",
            color: activeSensors.includes(key) ? s.color : "#3a5a4a",
            cursor: "pointer", fontFamily: font, fontSize: 12,
            transition: "all 0.2s",
          }}>
            {s.icon} {s.label || s.name}
          </button>
        ))}
        <button onClick={() => setShowAddSensor(true)} style={{
          padding: "6px 14px", borderRadius: 20, border: "1px dashed #1a3a2a",
          background: "transparent", color: "#3a5a4a", cursor: "pointer",
          fontFamily: font, fontSize: 12,
        }}>+ Sensör Ekle</button>
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
        padding: 16, minHeight: 250,
      }}>
        {tab === "osiloskop" && (
          <div>
            <Oscilloscope
              frames={currentFrames}
              baudRate={baudRate}
              width={700}
              height={180}
              playing={playing}
              activeFrame={activeFrameIdx}
              activeBit={activeBitIdx}
            />
            {currentFrames.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: "#4a6a5a", marginBottom: 6 }}>FRAME DETAY</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {currentFrames.map((f, i) => (
                    <BitFrameDisplay
                      key={i}
                      frame={f}
                      activeBit={activeFrameIdx === i ? activeBitIdx : -1}
                      playing={playing}
                    />
                  ))}
                </div>
              </div>
            )}
            {currentFrames.length === 0 && (
              <div style={{
                textAlign: "center", padding: 40, color: "#2a3a32",
                fontSize: 14,
              }}>
                Simülasyonu başlatın — sensör verileri burada görselleştirilecek
              </div>
            )}
          </div>
        )}

        {tab === "baudKarsilastirma" && (
          <div>
            <div style={{ fontSize: 11, color: "#4a6a5a", marginBottom: 8 }}>
              AYNI BYTE FARKLI BAUD RATE (9600 / 57600 / 115200)
            </div>
            <BaudRateComparison
              byte={currentFrames.length > 0 ? currentFrames[0].byte : 0x55}
              parity={parity}
            />
            <div style={{
              marginTop: 12, fontSize: 11, color: "#4a6a5a", lineHeight: 1.6,
              padding: 12, background: "#080c12", borderRadius: 8,
            }}>
              <strong style={{ color: "#ffd93d" }}>Bit Süresi Karşılaştırma</strong><br />
              {BAUD_RATES.map((r) => {
                const dur = ((1 / r) * 1e6).toFixed(2);
                return (
                  <span key={r} style={{ marginRight: 16 }}>
                    {r}: <span style={{ color: "#00ff88" }}>{dur} µs</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {tab === "log"      && <LogPanel logs={logs} />}
        {tab === "firmware" && <FirmwareTab font={font} />}
        {tab === "kullanim"  && <UsageGuideTab font={font} />}
      </div>

      {/* UART Config Summary */}
      <div style={{
        marginTop: 12, padding: 10, background: "#080c12", borderRadius: 8,
        border: "1px solid #1a2a22", fontSize: 11, color: "#4a6a5a",
        display: "flex", gap: 20, flexWrap: "wrap",
      }}>
        <span>Frame: <span style={{ color: "#00ff88" }}>1 Start + 8 Data{parity !== "none" ? " + 1 Parity" : ""} + {stopBits} Stop = {9 + (parity !== "none" ? 1 : 0) + stopBits} bit</span></span>
        <span>Bit Süresi: <span style={{ color: "#ffd93d" }}>{((1 / baudRate) * 1e6).toFixed(2)} µs</span></span>
        <span>Frame Süresi: <span style={{ color: "#a29bfe" }}>{((( 9 + (parity !== "none" ? 1 : 0) + stopBits) / baudRate) * 1e6).toFixed(2)} µs</span></span>
        <span>Aktif Sensör: <span style={{ color: "#ff6b6b" }}>{activeSensors.length}</span></span>
      </div>

      {showAddSensor && (
        <CustomSensorForm
          onAdd={handleAddCustomSensor}
          onClose={() => setShowAddSensor(false)}
        />
      )}
    </div>
  );
}
