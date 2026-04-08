import type { Scenario } from '../types';

// ─────────────────────────────────────────────
// HAZIR SENARYO ŞEKLONLERİ
// profileId alanı şablon uygulanırken doldurulacak
// ─────────────────────────────────────────────

type PresetScenario = Omit<Scenario, 'id' | 'profileId' | 'createdAt' | 'updatedAt'>;

export const PRESET_SCENARIOS: PresetScenario[] = [
  // ── FİZYOLOJİK ───────────────────────────────
  {
    name: 'Desatürasyon → İyileşme',
    description: 'SpO2 %70\'e düşer ve 10 saniyede normale döner',
    loop: false,
    durationMs: 20000,
    category: 'physiological',
    steps: [
      { id: 'ds1', atMs: 3000, target: 'field:SpO2', action: 'ramp', actionConfig: { from: 98, to: 70, durationMs: 5000, curve: 'ease-in' }, description: 'Desatürasyon' },
      { id: 'ds2', atMs: 8000, target: 'field:SpO2', action: 'ramp', actionConfig: { from: 70, to: 98, durationMs: 5000, curve: 'ease-out' }, description: 'İyileşme' },
    ],
  },
  {
    name: 'Bradikardi',
    description: 'Nabız yavaş yavaş 40 bpm\'e düşer',
    loop: false,
    durationMs: 15000,
    category: 'physiological',
    steps: [
      { id: 'br1', atMs: 2000, target: 'field:Nabız', action: 'ramp', actionConfig: { from: 75, to: 40, durationMs: 8000, curve: 'linear' }, description: 'Bradikardi başlangıcı' },
    ],
  },
  {
    name: 'Taşikardi',
    description: 'Nabız aniden 150 bpm\'e fırlar',
    loop: false,
    durationMs: 10000,
    category: 'physiological',
    steps: [
      { id: 'ta1', atMs: 1000, target: 'field:Nabız', action: 'ramp', actionConfig: { from: 75, to: 150, durationMs: 2000, curve: 'ease-in' }, description: 'Taşikardi' },
      { id: 'ta2', atMs: 7000, target: 'field:Nabız', action: 'ramp', actionConfig: { from: 150, to: 75, durationMs: 2000, curve: 'ease-out' }, description: 'Normalizasyon' },
    ],
  },
  {
    name: 'Hipertermi',
    description: 'Vücut ısısı 38.5°C\'ye yükselir',
    loop: false,
    durationMs: 20000,
    category: 'physiological',
    steps: [
      { id: 'ht1', atMs: 2000, target: 'field:Sıcaklık Düşük', action: 'ramp', actionConfig: { from: 370, to: 385, durationMs: 10000, curve: 'linear' }, description: 'Ateş yükselişi' },
      { id: 'ht2', atMs: 15000, target: 'field:Sıcaklık Düşük', action: 'ramp', actionConfig: { from: 385, to: 370, durationMs: 4000, curve: 'ease-out' }, description: 'İyileşme' },
    ],
  },
  {
    name: 'Kardiyak Arrest Simülasyonu',
    description: 'Tüm vital değerler sıfıra düşer',
    loop: false,
    durationMs: 10000,
    category: 'physiological',
    steps: [
      { id: 'ca1', atMs: 2000, target: 'field:SpO2', action: 'ramp', actionConfig: { from: 98, to: 0, durationMs: 3000, curve: 'ease-in' }, description: 'SpO2 düşüşü' },
      { id: 'ca2', atMs: 2000, target: 'field:Nabız', action: 'ramp', actionConfig: { from: 75, to: 0, durationMs: 3000, curve: 'ease-in' }, description: 'Nabız düşüşü' },
    ],
  },
  {
    name: 'Sinyal Bozulması',
    description: 'Kademeli sinyal kalitesi düşüşü',
    loop: false,
    durationMs: 15000,
    category: 'physiological',
    steps: [
      { id: 'sb1', atMs: 2000, target: 'bit:Durum.Düşük Sinyal', action: 'pulse', actionConfig: { value: 1, durationMs: 2000 }, description: 'İlk sinyal bozulması' },
      { id: 'sb2', atMs: 5000, target: 'bit:Durum.Hareket Artefaktı', action: 'set', actionConfig: { value: 1 }, description: 'Hareket artefaktı' },
      { id: 'sb3', atMs: 10000, target: 'bit:Durum.Düşük Sinyal', action: 'set', actionConfig: { value: 1 }, description: 'Kalıcı düşük sinyal' },
    ],
  },

  // ── HATA SENARYOLARI ──────────────────────────
  {
    name: 'Parmak Çıkarma',
    description: 'Parmak çıkarıldığında değerler sıfıra düşer',
    loop: false,
    durationMs: 8000,
    category: 'error',
    steps: [
      { id: 'fr1', atMs: 2000, target: 'bit:Durum.Parmak Algılandı', action: 'set', actionConfig: { value: 0 }, description: 'Parmak çıkartıldı' },
      { id: 'fr2', atMs: 2000, target: 'field:SpO2', action: 'set', actionConfig: { value: 0 }, description: 'SpO2 sıfıra düştü' },
      { id: 'fr3', atMs: 2000, target: 'field:Nabız', action: 'set', actionConfig: { value: 0 }, description: 'Nabız sıfıra düştü' },
      { id: 'fr4', atMs: 6000, target: 'bit:Durum.Parmak Algılandı', action: 'set', actionConfig: { value: 1 }, description: 'Parmak tekrar yerleştirildi' },
    ],
  },
  {
    name: 'Sensör Bağlantı Kesintisi',
    description: 'Sensör bağlantısı kesilir',
    loop: false,
    durationMs: 8000,
    category: 'error',
    steps: [
      { id: 'sd1', atMs: 2000, target: 'bit:Durum.Sensör Bağlantısı Yok', action: 'set', actionConfig: { value: 1 }, description: 'Bağlantı kesildi' },
      { id: 'sd2', atMs: 6000, target: 'bit:Durum.Sensör Bağlantısı Yok', action: 'set', actionConfig: { value: 0 }, description: 'Bağlantı yeniden kuruldu' },
    ],
  },
  {
    name: 'Düşük Batarya Uyarısı',
    description: 'Batarya düşük bayrağı aktifleşir',
    loop: false,
    durationMs: 5000,
    category: 'error',
    steps: [
      { id: 'lb1', atMs: 1000, target: 'bit:Durum.Düşük Batarya', action: 'set', actionConfig: { value: 1 }, description: 'Düşük batarya' },
    ],
  },
  {
    name: 'Hareket Artefaktı Patlaması',
    description: 'Yoğun hareket artefaktı dönemi',
    loop: true,
    durationMs: 4000,
    category: 'error',
    steps: [
      { id: 'ma1', atMs: 0, target: 'bit:Durum.Hareket Artefaktı', action: 'pulse', actionConfig: { value: 1, durationMs: 500 }, description: 'Hareket artefaktı' },
      { id: 'ma2', atMs: 1000, target: 'bit:Durum.Hareket Artefaktı', action: 'pulse', actionConfig: { value: 1, durationMs: 500 }, description: 'Hareket artefaktı' },
      { id: 'ma3', atMs: 2500, target: 'bit:Durum.Hareket Artefaktı', action: 'pulse', actionConfig: { value: 1, durationMs: 300 }, description: 'Hareket artefaktı' },
    ],
  },

  // ── STRES TESTLERİ ────────────────────────────
  {
    name: 'Hızlı Değer Salınımı',
    description: 'Değerler sınır değerleri arasında hızla değişir',
    loop: true,
    durationMs: 2000,
    category: 'stress',
    steps: [
      { id: 'rv1', atMs: 0, target: 'field:SpO2', action: 'set', actionConfig: { value: 100 }, description: 'Maksimum' },
      { id: 'rv2', atMs: 1000, target: 'field:SpO2', action: 'set', actionConfig: { value: 0 }, description: 'Minimum' },
    ],
  },
  {
    name: 'Sınır Değer Testi',
    description: 'SpO2 için uç sınır değerleri sırayla test edilir',
    loop: false,
    durationMs: 12000,
    category: 'stress',
    steps: [
      { id: 'bv1', atMs: 0, target: 'field:SpO2', action: 'set', actionConfig: { value: 0 }, description: 'Minimum' },
      { id: 'bv2', atMs: 3000, target: 'field:SpO2', action: 'set', actionConfig: { value: 127 }, description: 'Orta' },
      { id: 'bv3', atMs: 6000, target: 'field:SpO2', action: 'set', actionConfig: { value: 255 }, description: 'Maksimum' },
      { id: 'bv4', atMs: 9000, target: 'field:SpO2', action: 'range', actionConfig: { min: 95, max: 100 }, description: 'Normal aralık' },
    ],
  },

  // ── PROTOKOL HATALARI ─────────────────────────
  {
    name: 'Bozuk Checksum (3 Frame)',
    description: '3 ard arda frame\'de checksum bozulur',
    loop: false,
    durationMs: 3000,
    category: 'protocol',
    steps: [
      { id: 'cc1', atMs: 500, target: 'field:Checksum', action: 'inject_error', actionConfig: { errorType: 'corrupt_checksum', count: 3 }, description: 'Checksum enjeksiyonu' },
    ],
  },
  {
    name: 'Yanlış Sync Byte',
    description: 'Sync byte bozulur',
    loop: false,
    durationMs: 3000,
    category: 'protocol',
    steps: [
      { id: 'ws1', atMs: 500, target: 'field:Sync', action: 'inject_error', actionConfig: { errorType: 'wrong_sync', count: 5 }, description: 'Yanlış sync' },
    ],
  },
  {
    name: 'Kısaltılmış Frame',
    description: 'Frame\'den byte atlanır',
    loop: false,
    durationMs: 3000,
    category: 'protocol',
    steps: [
      { id: 'sf1', atMs: 500, target: 'field:Sync', action: 'inject_error', actionConfig: { errorType: 'skip_bytes', count: 3 }, description: 'Eksik byte' },
    ],
  },
  {
    name: 'Ekstra Byte Enjeksiyonu',
    description: 'Frame\'e çöp byte eklenir',
    loop: false,
    durationMs: 3000,
    category: 'protocol',
    steps: [
      { id: 'eb1', atMs: 500, target: 'field:Sync', action: 'inject_error', actionConfig: { errorType: 'extra_bytes', count: 3 }, description: 'Ekstra byte' },
    ],
  },
  {
    name: 'Frame Gecikmesi',
    description: 'Frame\'lerde zamanlama bozulması',
    loop: false,
    durationMs: 5000,
    category: 'protocol',
    steps: [
      { id: 'fd1', atMs: 1000, target: 'field:Sync', action: 'inject_error', actionConfig: { errorType: 'delay_frame', count: 10 }, description: 'Frame gecikmesi' },
    ],
  },
];

export const SCENARIO_CATEGORY_LABELS: Record<string, string> = {
  physiological: 'Fizyolojik',
  error: 'Hata',
  stress: 'Stres Testi',
  protocol: 'Protokol Hatası',
  combined: 'Birleşik',
  custom: 'Özel',
};

export const SCENARIO_CATEGORY_COLORS: Record<string, string> = {
  physiological: '#10b981',
  error: '#ef4444',
  stress: '#f59e0b',
  protocol: '#8b5cf6',
  combined: '#3b82f6',
  custom: '#6b7280',
};
