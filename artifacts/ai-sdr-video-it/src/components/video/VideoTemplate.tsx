import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { SceneHook } from './video_scenes/SceneHook';
import { ScenePain } from './video_scenes/ScenePain';
import { SceneReveal } from './video_scenes/SceneReveal';
import { SceneOfferings } from './video_scenes/SceneOfferings';
import { SceneBooked } from './video_scenes/SceneBooked';
import { SceneClose } from './video_scenes/SceneClose';

// Durations padded ~1.6x so on-screen text is comfortably readable.
export const SCENE_DURATIONS = {
  hook: 4800,
  pain: 5600,
  reveal: 4000,
  offerings: 8000,
  booked: 6400,
  close: 7200,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook: SceneHook,
  pain: ScenePain,
  reveal: SceneReveal,
  offerings: SceneOfferings,
  booked: SceneBooked,
  close: SceneClose,
};

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

const BLOB_POS = [
  { x: '70vw', y: '15vh', scale: 2.5, opacity: 0.25 },
  { x: '80vw', y: '60vh', scale: 1.8, opacity: 0.2 },
  { x: '50vw', y: '50vh', scale: 3.2, opacity: 0.3 },
  { x: '10vw', y: '20vh', scale: 1.5, opacity: 0.15 },
  { x: '15vw', y: '75vh', scale: 2.0, opacity: 0.22 },
  { x: '50vw', y: '50vh', scale: 2.8, opacity: 0.35 },
];

const ACCENT_LINE = [
  { left: '0%', width: '40%', top: '80%' },
  { left: '55%', width: '45%', top: '20%' },
  { left: '20%', width: '60%', top: '90%' },
  { left: '0%', width: '10%', top: '50%' },
  { left: '40%', width: '60%', top: '85%' },
  { left: '25%', width: '50%', top: '80%' },
];

function GridLines() {
  return (
    <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.04 }}>
      {Array.from({ length: 20 }).map((_, i) => (
        <line key={`v${i}`} x1={`${i * 5.26}%`} y1="0%" x2={`${i * 5.26}%`} y2="100%" stroke="#0EA5E9" strokeWidth="1"/>
      ))}
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={`h${i}`} x1="0%" y1={`${i * 9.09}%`} x2="100%" y2={`${i * 9.09}%`} stroke="#0EA5E9" strokeWidth="1"/>
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

  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey) !== -1 ? Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey) : 0;
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const pos = BLOB_POS[sceneIndex] ?? BLOB_POS[0];
  const accentLine = ACCENT_LINE[sceneIndex] ?? ACCENT_LINE[0];

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: 'var(--color-bg-dark)' }}>
      <GridLines />

      {/* Primary Glow */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: '45vw',
          height: '45vw',
          background: 'radial-gradient(circle, #0EA5E9 0%, transparent 60%)',
          willChange: 'transform, opacity',
        }}
        animate={{
          x: pos.x,
          y: pos.y,
          scale: pos.scale,
          opacity: pos.opacity,
        }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Emerald Secondary Glow */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: '30vw',
          height: '30vw',
          background: 'radial-gradient(circle, #10B981 0%, transparent 60%)',
          opacity: 0.1,
          willChange: 'transform',
        }}
        animate={{
          x: ['20vw', '65vw', '35vw', '20vw'],
          y: ['65vh', '25vh', '75vh', '65vh'],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="absolute h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, #0EA5E9, transparent)' }}
        animate={{
          left: accentLine.left,
          width: accentLine.width,
          top: accentLine.top,
          opacity: baseSceneKey === 'reveal' ? 0 : 0.6,
        }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
      />

      {[
        { style: { top: '6%', right: '5%' } },
        { style: { bottom: '10%', left: '5%' } },
      ].map((dot, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{ background: '#10B981', ...dot.style }}
          animate={{ opacity: [0.2, 0.9, 0.2] }}
          transition={{ repeat: Infinity, duration: 2.5 + i, delay: i * 0.5 }}
        />
      ))}

      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
