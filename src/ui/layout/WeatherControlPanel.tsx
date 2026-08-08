import { useState } from 'react';
import { useUiStore, type WeatherType } from '@/state/uiStore';
import { weatherAtmosphere } from '@/globe/weatherAtmosphere';
import { soundEngine } from '@/audio/soundEngine';

export function WeatherControlPanel() {
  const [expanded, setExpanded] = useState(false);
  const timeOfDay = useUiStore((s) => s.timeOfDay);
  const setTimeOfDay = useUiStore((s) => s.setTimeOfDay);
  const weatherType = useUiStore((s) => s.weatherType);
  const setWeatherType = useUiStore((s) => s.setWeatherType);

  const handleTimeChange = (val: number) => {
    setTimeOfDay(val);
    weatherAtmosphere.setTimeOfDay(val);
  };

  const handleWeatherSelect = (w: WeatherType) => {
    soundEngine.playClick();
    setWeatherType(w);
    weatherAtmosphere.setWeather(w);
  };

  const formatTimeStr = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.floor((hours % 1) * 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const displayM = m < 10 ? `0${m}` : m;
    return `${displayH}:${displayM} ${ampm}`;
  };

  return (
    <div className={`pointer-events-auto flex max-h-[min(60dvh,28rem)] max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-y-auto rounded-xl border border-white/15 bg-slate-950/90 p-2 shadow-xl backdrop-blur-md ${expanded ? 'min-w-[min(240px,calc(100vw-1rem))]' : ''}`}>
      <button type="button" onClick={() => setExpanded((open) => !open)} className="flex items-center justify-between gap-3 rounded-lg px-1 py-0.5 text-left hover:bg-white/5" aria-expanded={expanded}>
        <span className="text-xs font-bold text-teal-300 uppercase tracking-wider flex items-center gap-1.5">
          🌤️ Atmosphere & Weather
        </span>
        <span className="text-xs font-mono font-extrabold text-amber-300">
          {formatTimeStr(timeOfDay)}
        </span>
        <span className="text-[10px] text-slate-400">{expanded ? '×' : '⌃'}</span>
      </button>

      {/* Time of Day Slider */}
      <div className={expanded ? '' : 'hidden'}>
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold mb-1">
          <span>🌙 00:00</span>
          <span>🌅 06:00</span>
          <span>☀️ 12:00</span>
          <span>🌇 18:00</span>
          <span>🌙 24:00</span>
        </div>
        <input
          type="range"
          min="0"
          max="24"
          step="0.25"
          value={timeOfDay}
          onChange={(e) => handleTimeChange(parseFloat(e.target.value))}
          className="w-full accent-amber-400 cursor-pointer"
        />
      </div>

      {/* Weather Selector Buttons */}
      <div className={expanded ? '' : 'hidden'}>
        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
          Weather Conditions
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'clear', label: '☀️ Clear', icon: '☀️' },
            { id: 'rain', label: '🌧️ Rain', icon: '🌧️' },
            { id: 'snow', label: '❄️ Snow', icon: '❄️' },
            { id: 'fog', label: '🌫️ Fog', icon: '🌫️' },
            { id: 'storm', label: '⚡ Storm', icon: '⚡' },
          ].map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => handleWeatherSelect(w.id as WeatherType)}
              className={`rounded-lg px-2 py-1 text-xs font-bold transition cursor-pointer ${
                weatherType === w.id
                  ? 'border border-amber-400 bg-amber-500/25 text-amber-200 shadow-sm'
                  : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/15'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
