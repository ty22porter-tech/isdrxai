import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const STEPS = [
  { label: 'Step 1', name: 'Intro Email', days: 'Day 0', color: '#2563EB', done: true },
  { label: 'Step 2', name: 'Follow-up', days: 'Day 3', color: '#F59E0B', done: true },
  { label: 'Step 3', name: 'Breakup', days: 'Day 10', color: '#EF4444', done: false },
];

const PROSPECTS = [
  { company: 'Apex Medical Center', contact: 'Sandra L.', city: 'Phoenix', step: 'Follow-up', overdue: 4 },
  { company: 'Downtown Office Park', contact: 'Marcus T.', city: 'Houston', step: 'Follow-up', overdue: 2 },
  { company: 'Summit Tech Campus', contact: 'Priya K.', city: 'Austin', step: 'Breakup', overdue: 7 },
];

export function SceneSequences() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 700);
    const t3 = setTimeout(() => setPhase(3), 1150);
    const t4 = setTimeout(() => setPhase(4), 1600);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex"
      initial={{ clipPath: 'inset(0 0 100% 0)' }}
      animate={{ clipPath: 'inset(0 0 0% 0)' }}
      exit={{ clipPath: 'inset(0 0 100% 0)', transition: { duration: 0.45, ease: [0.4, 0, 0.6, 1] } }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Left: sequence diagram */}
      <div className="w-[38%] pl-[6vw] flex flex-col justify-center">
        <motion.p
          className="font-semibold tracking-[0.25em] uppercase mb-[1.5vh]"
          style={{ fontSize: '1.2vw', color: '#38BDF8', fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          Automated Sequences
        </motion.p>
        <motion.h2
          className="font-black leading-tight mb-[3vh]"
          style={{ fontSize: '3.6vw', color: '#F8FAFC', fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: 15 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{ duration: 0.45, delay: 0.08 }}
        >
          Follow up automatically.<br />
          <span style={{ color: '#2563EB' }}>Never miss a lead.</span>
        </motion.h2>

        {/* Step nodes */}
        <div className="relative pl-4">
          {/* Connecting line */}
          <motion.div
            className="absolute left-[1.8vw] top-[1.2vw] w-px"
            style={{ background: 'linear-gradient(180deg, #2563EB, #EF4444)' }}
            initial={{ height: 0 }}
            animate={phase >= 2 ? { height: '70%' } : { height: 0 }}
            transition={{ duration: 0.7, ease: 'circOut' }}
          />
          {STEPS.map((step, i) => (
            <motion.div
              key={step.label}
              className="flex items-center gap-[1.5vw] mb-[2.5vh] relative"
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= i + 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: 0.4, ease: 'circOut' }}
            >
              <div
                className="rounded-full flex items-center justify-center shrink-0 z-10"
                style={{
                  width: '3.2vw',
                  height: '3.2vw',
                  background: step.done ? step.color : 'rgba(255,255,255,0.08)',
                  border: `2px solid ${step.color}`,
                  fontSize: '1.1vw',
                  color: 'white',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                }}
              >
                {step.done ? '✓' : i + 1}
              </div>
              <div>
                <p style={{ fontSize: '1.4vw', color: '#F8FAFC', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  {step.name}
                </p>
                <p style={{ fontSize: '0.9vw', color: step.color, fontFamily: 'var(--font-body)' }}>
                  {step.days}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right: overdue prospect list */}
      <div className="flex-1 pr-[6vw] flex flex-col justify-center">
        <motion.div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(15,31,61,0.9)',
            border: '1px solid rgba(37,99,235,0.2)',
          }}
          initial={{ opacity: 0, x: 30 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="px-[2vw] py-[1.5vh] flex items-center justify-between"
            style={{ borderBottom: '1px solid rgba(37,99,235,0.15)' }}
          >
            <span style={{ fontSize: '1.1vw', color: '#F8FAFC', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              Overdue Follow-ups
            </span>
            <span
              className="px-3 py-1 rounded-full"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', fontSize: '0.85vw', fontFamily: 'var(--font-display)', fontWeight: 600 }}
            >
              {PROSPECTS.length} due now
            </span>
          </div>

          {PROSPECTS.map((p, i) => (
            <motion.div
              key={p.company}
              className="px-[2vw] py-[1.5vh] flex items-center justify-between"
              style={{ borderBottom: i < PROSPECTS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
              initial={{ opacity: 0, x: 20 }}
              animate={phase >= i + 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
              transition={{ duration: 0.4, ease: 'circOut', delay: i * 0.08 }}
            >
              <div>
                <p style={{ fontSize: '1.2vw', color: '#F8FAFC', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  {p.company}
                </p>
                <p style={{ fontSize: '0.9vw', color: '#64748B', fontFamily: 'var(--font-body)' }}>
                  {p.contact} · {p.city}
                </p>
              </div>
              <div className="flex items-center gap-[1vw]">
                <span
                  className="px-2 py-0.5 rounded-full"
                  style={{
                    background: p.step === 'Breakup' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                    color: p.step === 'Breakup' ? '#EF4444' : '#F59E0B',
                    fontSize: '0.8vw',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                  }}
                >
                  {p.step}
                </span>
                <span style={{ fontSize: '0.85vw', color: '#64748B', fontFamily: 'var(--font-body)' }}>
                  {p.overdue}d ago
                </span>
                <div
                  className="px-3 py-1 rounded-lg font-semibold"
                  style={{
                    background: 'rgba(37,99,235,0.2)',
                    color: '#93C5FD',
                    fontSize: '0.9vw',
                    fontFamily: 'var(--font-display)',
                    border: '1px solid rgba(37,99,235,0.3)',
                  }}
                >
                  Send
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
