import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { SceneHook } from './video_scenes/SceneHook';
import { ScenePain } from './video_scenes/ScenePain';
import { SceneReveal } from './video_scenes/SceneReveal';
import { SceneEmails } from './video_scenes/SceneEmails';
import { SceneCampaigns } from './video_scenes/SceneCampaigns';
import { SceneSequences } from './video_scenes/SceneSequences';
import { SceneClose } from './video_scenes/SceneClose';

export const SCENE_DURATIONS = {
  hook: 2800,
  pain: 3500,
  reveal: 2000,
  emails: 4500,
  campaigns: 4000,
  sequences: 3500,
  close: 4500,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook: SceneHook,
  pain: ScenePain,
  reveal: SceneReveal,
  emails: SceneEmails,
  campaigns: SceneCampaigns,
  sequences: SceneSequences,
  close: SceneClose,
};

// Scene start offsets (seconds) for audio seeking
const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

// Persistent midground shape positions per scene index
const BLOB_POS = [
  { x: '75vw', y: '10vh', scale: 2.2, opacity: 0.22 },
  { x: '80vw', y: '60vh', scale: 1.5, opacity: 0.18 },
  { x: '50vw', y: '50vh', scale: 3.0, opacity: 0.28 },
  { x: '5vw',  y: '20vh', scale: 1.8, opacity: 0.15 },
  { x: '70vw', y: '30vh', scale: 1.4, opacity: 0.2 },
  { x: '10vw', y: '70vh', scale: 1.6, opacity: 0.18 },
  { x: '50vw', y: '50vh', scale: 2.5, opacity: 0.3 },
];

const ACCENT_LINE = [
  { left: '0%', width: '35%', top: '85%' },
  { left: '60%', width: '40%', top: '15%' },
  { left: '30%', width: '40%', top: '92%' },
  { left: '0%', width: '5%', top: '50%' },
  { left: '55%', width: '45%', top: '88%' },
  { left: '38%', width: '62%', top: '12%' },
  { left: '20%', width: '60%', top: '78%' },
];

// Grid line pattern for the background
function GridLines() {
  return (
    <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.035 }}>
      {Array.from({ length: 20 }).map((_, i) => (
        <line key={`v${i}`} x1={`${i * 5.26}%`} y1="0%" x2={`${i * 5.26}%`} y2="100%" stroke="#2563EB" strokeWidth="1"/>
      ))}
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={`h${i}`} x1="0%" y1={`${i * 9.09}%`} x2="100%" y2={`${i * 9.09}%`} stroke="#2563EB" strokeWidth="1"/>
      ))}
    </svg>
  );
}

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);
  const pos = BLOB_POS[sceneIndex] ?? BLOB_POS[0];
  const accentLine = ACCENT_LINE[sceneIndex] ?? ACCENT_LINE[0];

  return (
    <>
      <div className="relative w-full h-screen overflow-hidden" style={{ background: '#050F1E' }}>
        {/* Grid background */}
        <GridLines />

        {/* Persistent background glow */}
        <motion.div
          className="absolute rounded-full blur-3xl pointer-events-none"
          style={{
            width: '40vw',
            height: '40vw',
            background: 'radial-gradient(circle, #2563EB 0%, transparent 70%)',
          }}
          animate={{
            x: pos.x,
            y: pos.y,
            scale: pos.scale,
            opacity: pos.opacity,
          }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Cyan secondary glow — always drifts */}
        <motion.div
          className="absolute rounded-full blur-3xl pointer-events-none"
          style={{
            width: '25vw',
            height: '25vw',
            background: 'radial-gradient(circle, #38BDF8 0%, transparent 70%)',
            opacity: 0.08,
          }}
          animate={{
            x: ['15vw', '60vw', '30vw', '15vw'],
            y: ['70vh', '20vh', '80vh', '70vh'],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Persistent accent line */}
        <motion.div
          className="absolute h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, #2563EB, transparent)' }}
          animate={{
            left: accentLine.left,
            width: accentLine.width,
            top: accentLine.top,
            opacity: baseSceneKey === 'reveal' ? 0 : 0.5,
          }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Persistent corner dots */}
        {[
          { style: { top: '5%', right: '4%' } },
          { style: { bottom: '8%', left: '4%' } },
        ].map((dot, i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full"
            style={{ background: '#2563EB', ...dot.style }}
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ repeat: Infinity, duration: 2 + i, delay: i * 0.7 }}
          />
        ))}

        {/* Scene foreground */}
        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
      </div>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </>
  );
}
