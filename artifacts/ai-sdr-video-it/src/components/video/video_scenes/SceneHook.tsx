import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const WORDS = ['SERVERS', 'NETWORKS', 'FIREWALLS'];

export function SceneHook() {
  const [phase, setPhase] = useState(0);
  const [wordIdx, setWordIdx] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 900);
    const t3 = setTimeout(() => setPhase(3), 1600);
    const t4 = setTimeout(() => { setWordIdx(1); setPhase(2); }, 1900);
    const t5 = setTimeout(() => { setWordIdx(2); setPhase(2); }, 2500);
    const t6 = setTimeout(() => setPhase(4), 2800);
    return () => [t1, t2, t3, t4, t5, t6].forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ clipPath: 'inset(0 100% 0 0)' }}
      animate={{ clipPath: 'inset(0 0% 0 0)' }}
      exit={{ clipPath: 'inset(0 0 0 100%)', transition: { duration: 0.5, ease: [0.4, 0, 0.6, 1] } }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative z-10 text-center px-8">
        <motion.p
          className="text-[1.8vw] font-medium tracking-[0.3em] uppercase mb-4"
          style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: 0.4, ease: 'circOut' }}
        >
          You're busy fixing
        </motion.p>

        <div className="overflow-hidden" style={{ height: '14vw' }}>
          <motion.h1
            key={wordIdx}
            className="font-black leading-none tracking-tighter"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '12vw',
              color: '#F8FAFC',
              WebkitTextStroke: wordIdx === 0 ? '2px var(--color-primary)' : 'none',
            }}
            initial={{ y: '100%', opacity: 0 }}
            animate={phase >= 2 ? { y: 0, opacity: 1 } : { y: '100%', opacity: 0 }}
            exit={{ y: '-100%', opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {WORDS[wordIdx]}
          </motion.h1>
        </div>

        <motion.div
          className="h-[3px] mx-auto mt-6"
          style={{ background: 'var(--color-accent)' }}
          initial={{ width: 0 }}
          animate={phase >= 3 ? { width: '40%' } : { width: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </motion.div>
  );
}
