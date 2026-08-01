import { useState } from 'react';
import { useUiStore } from '@/state/uiStore';
import { useWorldStore } from '@/state/worldStore';

const steps = [
  {
    title: '🌍 Welcome to Terraforge',
    badge: 'Step 1 of 4',
    content:
      'Terraforge is a 3D world-building playground. Build custom continents, regions, kingdoms, and cities directly on an interactive 3D globe.',
    tips: [
      'Left-Click + Drag to rotate the globe',
      'Scroll wheel / Pinch to zoom in & out',
      'Right-Click + Drag / Two-Finger Drag to tilt camera',
    ],
    accent: 'from-teal-500/20 to-emerald-500/10',
  },
  {
    title: '🔍 Select & Inspect Places',
    badge: 'Step 2 of 4',
    content:
      'Click any territory or city marker on the globe to inspect its details! The Inspector panel on the right displays the place’s name, type, description, and custom properties.',
    tips: [
      'Entities are synchronized live from the Zustand world store',
      'Use the Inspector panel to edit place details and colors',
      'Click empty space to clear your selection',
    ],
    accent: 'from-blue-500/20 to-cyan-500/10',
  },
  {
    title: '🗺️ Explore Sample Worlds',
    badge: 'Step 3 of 4',
    content:
      'Explore pre-built worlds right away! Use the top bar dropdown to instant-switch between worlds:',
    tips: [
      '🌍 Real Earth: Earth’s continents (North America, Europe, Asia, etc.) & world capitals',
      '🗡️ Middle-earth (Arda): Gondor, Mordor, Rohan, Rivendell, and Minas Tirith',
      '✨ Demo Planet: Playground continent for testing',
    ],
    actionPreset: true,
    accent: 'from-purple-500/20 to-pink-500/10',
  },
  {
    title: '✍️ Build Your Own World',
    badge: 'Step 4 of 4',
    content:
      'Use the Tool Rail on the left to switch interaction modes. Complete your map with custom polygons, city markers, and undo/redo history at the bottom!',
    tips: [
      'Toolbar supports Select, Pan, Draw, Edit, and City placement',
      'Undo/Redo is supported via status bar history controls',
      'You can re-open this tutorial anytime by clicking "❓ Tutorial" in the header',
    ],
    accent: 'from-amber-500/20 to-orange-500/10',
  },
];

export function TutorialModal() {
  const tutorialOpen = useUiStore((s) => s.tutorialOpen);
  const markTutorialSeen = useUiStore((s) => s.markTutorialSeen);
  const loadSampleWorld = useWorldStore((s) => s.loadSampleWorld);

  const [currentStep, setCurrentStep] = useState(0);

  if (!tutorialOpen) return null;

  const step = steps[currentStep] ?? steps[0];
  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      markTutorialSeen();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/15 bg-slate-900 shadow-2xl">
        {/* Header background glow */}
        <div
          className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${step.accent} opacity-60 pointer-events-none transition-all duration-300`}
        />

        <div className="relative p-6">
          {/* Top Row: Badge & Close */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 font-medium text-teal-300">
              {step.badge}
            </span>
            <button
              type="button"
              onClick={() => markTutorialSeen()}
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
              aria-label="Close tutorial"
            >
              ✕
            </button>
          </div>

          {/* Title & Content */}
          <h2 className="mt-3 text-xl font-bold text-white tracking-wide">
            {step.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {step.content}
          </p>

          {/* Preset Buttons on Step 3 */}
          {step.actionPreset && (
            <div className="my-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadSampleWorld('earth')}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 transition"
              >
                🌍 Load Real Earth
              </button>
              <button
                type="button"
                onClick={() => loadSampleWorld('middle-earth')}
                className="rounded-xl border border-amber-500/40 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 transition"
              >
                🗡️ Load Middle-earth
              </button>
            </div>
          )}

          {/* Feature Bullets */}
          <ul className="mt-4 space-y-2 rounded-2xl border border-white/5 bg-slate-950/40 p-3 text-xs text-slate-300">
            {step.tips.map((tip, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-teal-400 font-bold">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>

          {/* Pagination Indicators & Buttons */}
          <div className="mt-6 flex items-center justify-between pt-2 border-t border-white/10">
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentStep(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === currentStep
                      ? 'w-6 bg-teal-400'
                      : 'w-2 bg-slate-700 hover:bg-slate-500'
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="rounded-xl bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 transition"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                className="rounded-xl bg-teal-500 px-5 py-2 text-xs font-semibold text-slate-950 shadow-lg shadow-teal-500/20 hover:bg-teal-400 transition"
              >
                {isLast ? 'Get Started 🚀' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
