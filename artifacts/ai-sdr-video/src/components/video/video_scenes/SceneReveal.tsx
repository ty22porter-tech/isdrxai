import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function SceneReveal() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 500);
    const t3 = setTimeout(() => setPhase(3), 900);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(80% at 50% 50%)' }}
      exit={{ clipPath: 'circle(0% at 50% 50%)', transition: { duration: 0.5, ease: [0.4, 0, 0.6, 1] } }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Flash ring */}
      <motion.div
        className="absolute rounded-full"
        style={{ border: '2px solid #2563EB' }}
        initial={{ width: '8vw', height: '8vw', opacity: 1 }}
        animate={phase >= 1 ? { width: '120vw', height: '120vw', opacity: 0 } : {}}
        transition={{ duration: 0.8, ease: 'circOut' }}
      />

      <div className="relative z-10 text-center">
        {/* Logo mark */}
        <motion.div
          className="mx-auto mb-[2vh] flex items-center justify-center rounded-2xl"
          style={{
            width: '6vw',
            height: '6vw',
            background: 'linear-gradient(135deg, #2563EB 0%, #38BDF8 100%)',
          }}
          initial={{ scale: 0, rotate: -20 }}
          animate={phase >= 1 ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        >
          <svg width="55%" height="55%" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>

        <motion.h1
          className="font-black tracking-tight leading-none"
          style={{ fontSize: '9vw', color: '#F8FAFC', fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          AI <span style={{ color: '#2563EB' }}>SDR</span>
        </motion.h1>

        <motion.p
          className="mt-[1.5vh] font-medium"
          style={{ fontSize: '1.8vw', color: '#94A3B8', fontFamily: 'var(--font-body)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          Outreach on autopilot — for janitorial companies
        </motion.p>
      </div>
    </motion.div>
  );
}
