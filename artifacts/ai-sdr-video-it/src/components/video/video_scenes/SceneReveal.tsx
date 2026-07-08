import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function SceneReveal() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 500);
    return () => [t1, t2].forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-primary"
      style={{ background: 'var(--color-primary)' }}
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.0, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.div
        className="relative z-10 text-center"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={phase >= 1 ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      >
        <p className="text-[1.5vw] font-bold tracking-widest text-white/80 mb-2 uppercase">Meet Your New Top Performer</p>
        <h1
          className="text-[9vw] font-black tracking-tighter text-white leading-none"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          iSDRX AI
        </h1>
        <motion.div
          className="inline-block mt-4 px-6 py-2 bg-white text-primary text-[1.4vw] font-bold rounded-full"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          FOR IT & MSPs
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
