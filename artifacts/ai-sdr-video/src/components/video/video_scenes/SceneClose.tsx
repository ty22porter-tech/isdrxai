import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const PILLARS = ['AI Emails', 'Campaign Mgmt', 'Auto Follow-ups', 'Call Scripts'];

export function SceneClose() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 800);
    const t3 = setTimeout(() => setPhase(3), 1400);
    const t4 = setTimeout(() => setPhase(4), 2200);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, transition: { duration: 0.6 } }}
      transition={{ duration: 0.4 }}
    >
      {/* Expanding ring */}
      <motion.div
        className="absolute rounded-full"
        style={{ border: '1px solid rgba(37,99,235,0.3)' }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={phase >= 1 ? { width: '80vw', height: '80vw', opacity: 0 } : { width: '20vw', height: '20vw', opacity: 0.6 }}
        transition={{ duration: 1.2, ease: 'circOut' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ border: '1px solid rgba(56,189,248,0.2)' }}
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={phase >= 1 ? { width: '55vw', height: '55vw', opacity: 0 } : { width: '14vw', height: '14vw', opacity: 0.4 }}
        transition={{ duration: 1.0, ease: 'circOut', delay: 0.15 }}
      />

      {/* Logo */}
      <motion.div
        className="flex items-center justify-center rounded-2xl mb-[2.5vh]"
        style={{
          width: '7vw',
          height: '7vw',
          background: 'linear-gradient(135deg, #2563EB 0%, #38BDF8 100%)',
          boxShadow: '0 0 60px rgba(37,99,235,0.5)',
        }}
        initial={{ scale: 0, rotate: -30 }}
        animate={phase >= 1 ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -30 }}
        transition={{ type: 'spring', stiffness: 350, damping: 20 }}
      >
        <svg width="55%" height="55%" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </motion.div>

      {/* Main headline */}
      <motion.h1
        className="font-black leading-none tracking-tight"
        style={{ fontSize: '8.5vw', color: '#F8FAFC', fontFamily: 'var(--font-display)' }}
        initial={{ opacity: 0, y: 30 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        iSDRX <span style={{ color: '#2563EB' }}>AI</span>
      </motion.h1>

      <motion.p
        className="mt-[1.5vh] font-medium"
        style={{ fontSize: '2.2vw', color: '#38BDF8', fontFamily: 'var(--font-display)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        Outreach on autopilot.
      </motion.p>

      {/* Pillars */}
      <motion.div
        className="flex gap-[2vw] mt-[3.5vh]"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5, ease: 'circOut' }}
      >
        {PILLARS.map((p, i) => (
          <motion.div
            key={p}
            className="px-[1.5vw] py-[0.8vh] rounded-xl"
            style={{
              background: 'rgba(37,99,235,0.12)',
              border: '1px solid rgba(37,99,235,0.25)',
              fontSize: '1vw',
              color: '#93C5FD',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
            }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.35, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
          >
            {p}
          </motion.div>
        ))}
      </motion.div>

      {/* Tagline */}
      <motion.p
        className="mt-[3vh]"
        style={{ fontSize: '1.2vw', color: '#475569', fontFamily: 'var(--font-body)' }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        Built for janitorial companies who are serious about commercial growth.
      </motion.p>
    </motion.div>
  );
}
