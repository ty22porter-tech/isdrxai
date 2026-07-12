import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const OFFERINGS = [
  'Cybersecurity',
  'Microsoft 365',
  'Managed Security',
  'Software/Hardware Sourcing',
  'IT Services',
  'IT Support',
  'Mobile Device Management'
];

export function SceneOfferings() {
  const [phase, setPhase] = useState(0);
  const [itemIdx, setItemIdx] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300);
    const timers = OFFERINGS.map((_, i) =>
      setTimeout(() => {
        setItemIdx(i);
      }, 700 + i * 600)
    );
    return () => [t1, ...timers].forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ scale: 0.9, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      <div className="absolute top-[25%] text-center w-full">
        <motion.h2
          className="text-[3.5vw] font-bold text-white tracking-tight"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: -20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        >
          Automated sequences across
        </motion.h2>
        <motion.h2
          className="text-[3.5vw] font-bold text-white/50 tracking-tight"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: -20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
          transition={{ delay: 0.1 }}
        >
          your entire tech stack
        </motion.h2>
      </div>

      <div className="absolute top-[50%] w-full flex justify-center">
        <div className="relative w-[80vw] h-[15vw] flex items-center justify-center overflow-hidden border-y border-slate-800 bg-slate-900/60">
          <motion.div
            key={itemIdx}
            className="text-[6vw] font-black text-accent tracking-tighter"
            style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-display)' }}
            initial={{ y: 80, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -80, opacity: 0, scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            {OFFERINGS[itemIdx]}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
