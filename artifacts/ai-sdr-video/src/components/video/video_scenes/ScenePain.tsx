import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const PAIN_ITEMS = [
  { icon: '📋', label: 'Manual prospect lists', sub: '4 hrs / week' },
  { icon: '📞', label: 'Cold calling from memory', sub: '12% connect rate' },
  { icon: '✉️', label: 'Copy-paste emails', sub: '2% reply rate' },
];

export function ScenePain() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 150);
    const t2 = setTimeout(() => setPhase(2), 600);
    const t3 = setTimeout(() => setPhase(3), 1100);
    const t4 = setTimeout(() => setPhase(4), 1600);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col justify-center pl-[8vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -60, transition: { duration: 0.4 } }}
      transition={{ duration: 0.35 }}
    >
      <motion.p
        className="text-[1.4vw] font-medium tracking-[0.25em] uppercase mb-[3vh]"
        style={{ color: '#38BDF8', fontFamily: 'var(--font-display)' }}
        initial={{ opacity: 0, x: -20 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        transition={{ duration: 0.4, ease: 'circOut' }}
      >
        The Old Way
      </motion.p>

      <div className="space-y-[2vh]">
        {PAIN_ITEMS.map((item, i) => (
          <motion.div
            key={item.label}
            className="flex items-center gap-[2vw]"
            initial={{ opacity: 0, x: -40 }}
            animate={phase >= i + 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="flex items-center justify-center rounded-xl shrink-0"
              style={{
                width: '4.5vw',
                height: '4.5vw',
                background: 'rgba(37,99,235,0.15)',
                border: '1px solid rgba(37,99,235,0.3)',
                fontSize: '2vw',
              }}
            >
              {item.icon}
            </div>
            <div>
              <p
                className="font-semibold leading-tight"
                style={{ fontSize: '2.2vw', color: '#F8FAFC', fontFamily: 'var(--font-display)' }}
              >
                {item.label}
              </p>
              <p style={{ fontSize: '1.2vw', color: '#EF4444', fontFamily: 'var(--font-body)' }}>
                {item.sub}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Right side: big stat */}
      <motion.div
        className="absolute right-[8vw] top-1/2 -translate-y-1/2 text-right"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={phase >= 4 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <p
          className="font-black leading-none"
          style={{ fontSize: '14vw', color: 'rgba(239,68,68,0.15)', fontFamily: 'var(--font-display)' }}
        >
          2%
        </p>
        <p style={{ fontSize: '1.4vw', color: '#94A3B8', fontFamily: 'var(--font-body)' }}>
          average reply rate
        </p>
      </motion.div>
    </motion.div>
  );
}
