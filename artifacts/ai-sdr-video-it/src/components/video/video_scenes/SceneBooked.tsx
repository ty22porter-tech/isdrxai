import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function SceneBooked() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 1200);
    const t3 = setTimeout(() => setPhase(3), 2000);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ y: '100%', opacity: 0, transition: { duration: 0.5, ease: 'easeIn' } }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="w-[50vw] bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl relative"
        initial={{ scale: 0.8, y: 50, rotateX: 20, opacity: 0 }}
        animate={phase >= 1 ? { scale: 1, y: 0, rotateX: 0, opacity: 1 } : { scale: 0.8, y: 50, rotateX: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl">🤝</div>
          <div>
            <h3 className="text-white text-xl font-bold font-display">New Reply</h3>
            <p className="text-slate-400 text-sm">Automated response sent</p>
          </div>
        </div>

        <motion.div
          className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50"
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          transition={{ duration: 0.4 }}
        >
          <p className="text-slate-300 text-lg">
            "Yes, we're actually looking to upgrade our firewall setup next quarter. Let's talk."
          </p>
        </motion.div>

        <motion.div
          className="absolute -right-12 -bottom-12 bg-accent text-slate-950 font-bold text-[2vw] px-8 py-4 rounded-xl shadow-[0_0_40px_rgba(16,185,129,0.3)] rotate-[-5deg]"
          initial={{ scale: 0, opacity: 0 }}
          animate={phase >= 3 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          FREE IT ASSESSMENT BOOKED
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
