import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function ScenePain() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300);
    const t2 = setTimeout(() => setPhase(2), 1400);
    return () => [t1, t2].forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ filter: 'blur(20px)', opacity: 0 }}
      animate={{ filter: 'blur(0px)', opacity: 1 }}
      exit={{ scale: 1.1, opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative z-10 text-center px-12">
        <motion.h2
          className="text-[6vw] font-black tracking-tight leading-[1.1] text-white"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          But who is finding your
          <br />
          <span style={{ color: 'var(--color-primary)' }}>next client?</span>
        </motion.h2>

        <motion.div
          className="mt-12 flex justify-center gap-6 text-[1.4vw] font-mono"
          style={{ color: 'var(--color-secondary)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="px-4 py-2 border border-slate-800 rounded-md bg-slate-900/50">NO TIME TO PROSPECT</div>
          <div className="px-4 py-2 border border-slate-800 rounded-md bg-slate-900/50">NO SALES TEAM</div>
        </motion.div>
      </div>
    </motion.div>
  );
}
