import { LruCache } from '@/utils/lruCache';

export type PinStyle = 'teardrop' | 'beacon' | 'flag' | 'pushpin' | 'dot';

export type PinIcon =
  | 'capital'
  | 'city'
  | 'mountain'
  | 'landmark'
  | 'castle'
  | 'camera'
  | 'airport'
  | 'port'
  | 'nature'
  | 'pin';

export interface PinOptions {
  color?: string;
  style?: PinStyle;
  icon?: PinIcon;
  selected?: boolean;
  size?: number;
}

// Bounded: pin colors are arbitrary (color picker) so an unbounded map grows forever.
const pinCache = new LruCache<string, string>(150);

const ICON_SYMBOLS: Record<PinIcon, string> = {
  capital: '★',
  city: '🏢',
  mountain: '🏔',
  landmark: '🏛',
  castle: '🏰',
  camera: '📷',
  airport: '✈',
  port: '⚓',
  nature: '🌲',
  pin: '📍',
};

/**
 * Generates high-definition HTML5 Canvas SVG data URLs for Google Earth-style markers & pins.
 */
export function getPinBillboardDataUrl(options: PinOptions = {}): string {
  const color = options.color || '#3b82f6';
  const style = options.style || 'teardrop';
  const icon = options.icon || 'pin';
  const selected = !!options.selected;
  const baseSize = options.size || 64;

  const key = `${color}_${style}_${icon}_${selected}_${baseSize}`;
  if (pinCache.has(key)) {
    return pinCache.get(key)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = baseSize;
  canvas.height = baseSize * (style === 'teardrop' || style === 'flag' ? 1.25 : 1);
  const ctx = canvas.getContext('2d');

  if (!ctx) return '';

  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;

  ctx.clearRect(0, 0, w, h);

  if (selected) {
    // Outer selection aura/glow ring
    ctx.shadowColor = '#fde047';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, w / 2, w * 0.44, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (style === 'teardrop') {
    const headRadius = w * 0.36;
    const cy = headRadius + 4;
    const tipY = h - 4;

    // Subtle drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, tipY, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Teardrop path
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, headRadius, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.lineTo(cx, tipY);
    ctx.closePath();
    ctx.fill();

    // Crisp white border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner icon badge circle
    const innerRadius = headRadius * 0.62;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Icon character/text
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(innerRadius * 1.2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ICON_SYMBOLS[icon] || '📍', cx, cy + 1);
  } else if (style === 'beacon') {
    const cy = h / 2;
    const r = w * 0.36;

    // Glowing sonar rings
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1.0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(r * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ICON_SYMBOLS[icon] || '★', cx, cy + 1);
  } else if (style === 'flag') {
    // Flag pole
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 10, h - 4);
    ctx.lineTo(cx - 10, 8);
    ctx.stroke();

    // Flag banner
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - 10, 8);
    ctx.lineTo(cx + 18, 18);
    ctx.lineTo(cx - 10, 28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pole base dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 10, h - 4, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'pushpin') {
    // Pin needle
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, h / 2);
    ctx.lineTo(cx, h - 4);
    ctx.stroke();

    // Pin head knob
    const cy = h * 0.35;
    const r = w * 0.32;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(r * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ICON_SYMBOLS[icon] || '📍', cx, cy + 1);
  } else {
    // Dot pin
    const cy = h / 2;
    const r = w * 0.32;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  const dataUrl = canvas.toDataURL('image/png');
  pinCache.set(key, dataUrl);
  return dataUrl;
}
