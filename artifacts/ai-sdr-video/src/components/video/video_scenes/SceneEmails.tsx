import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const EMAIL_LINES = [
  'Hi Sandra,',
  '',
  'I noticed Apex Medical Center is expanding its Phoenix campus.',
  'Keeping exam rooms spotless between patients is a real challenge',
  'at that volume — and infection control adds another layer.',
  '',
  'At CleanPro Janitorial we specialize in healthcare facilities...',
];

export function SceneEmails() {
  const [phase, setPhase] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 150);
    const t2 = setTimeout(() => setPhase(2), 700);

    const lineTimers: ReturnType<typeof setTimeout>[] = [];
    EMAIL_LINES.forEach((_, i) => {
      lineTimers.push(setTimeout(() => setVisibleLines(i + 1), 1100 + i * 340));
    });

    const t3 = setTimeout(() => setPhase(3), 3000);
    return () => [t1, t2, t3, ...lineTimers].forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: 40, transition: { duration: 0.4 } }}
      transition={{ duration: 0.3 }}
    >
      {/* Left label */}
      <div className="pl-[6vw] pr-[4vw] w-[38%] shrink-0">
        <motion.div
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-[2vh]"
          style={{ background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.4)' }}
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          transition={{ duration: 0.4, ease: 'circOut' }}
        >
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ background: '#38BDF8' }}
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
          />
          <span style={{ fontSize: '1vw', color: '#38BDF8', fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.1em' }}>
            AI GENERATING
          </span>
        </motion.div>

        <motion.h2
          className="font-black leading-tight"
          style={{ fontSize: '4.5vw', color: '#F8FAFC', fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          Personalized<br />
          <span style={{ color: '#2563EB' }}>Cold Emails</span>
        </motion.h2>

        <motion.p
          className="mt-[1.5vh]"
          style={{ fontSize: '1.3vw', color: '#94A3B8', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          GPT-powered emails tailored to each prospect's industry, location, and pain points.
        </motion.p>

        <motion.div
          className="mt-[2vh] flex gap-3"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {['Intro', 'Follow-up', 'Breakup'].map((step, i) => (
            <div
              key={step}
              className="rounded-lg px-3 py-1.5 text-center"
              style={{
                background: i === 0 ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${i === 0 ? 'rgba(37,99,235,0.5)' : 'rgba(255,255,255,0.1)'}`,
                fontSize: '0.95vw',
                color: i === 0 ? '#93C5FD' : '#64748B',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
              }}
            >
              Step {i + 1}<br />{step}
            </div>
          ))}
        </motion.div>
      </div>

      {/* Email card */}
      <motion.div
        className="flex-1 mr-[6vw] rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(15,31,61,0.9)',
          border: '1px solid rgba(37,99,235,0.25)',
          boxShadow: '0 25px 60px rgba(37,99,235,0.15)',
        }}
        initial={{ opacity: 0, x: 40, scale: 0.96 }}
        animate={phase >= 2 ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: 40, scale: 0.96 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Email header bar */}
        <div
          className="px-5 py-3 flex items-center gap-3"
          style={{ borderBottom: '1px solid rgba(37,99,235,0.15)', background: 'rgba(37,99,235,0.08)' }}
        >
          <div className="flex gap-1.5">
            {['#EF4444','#F59E0B','#10B981'].map(c => (
              <div key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />
            ))}
          </div>
          <span style={{ fontSize: '1vw', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
            To: sandra@apexmedical.com
          </span>
          <span
            className="ml-auto px-2 py-0.5 rounded"
            style={{ fontSize: '0.85vw', background: 'rgba(16,185,129,0.15)', color: '#10B981', fontFamily: 'var(--font-mono)' }}
          >
            AI Draft
          </span>
        </div>

        {/* Email body */}
        <div className="p-5" style={{ fontFamily: 'var(--font-body)', fontSize: '1.05vw', lineHeight: 1.7 }}>
          {EMAIL_LINES.map((line, i) => (
            <motion.p
              key={i}
              style={{ color: line === '' ? 'transparent' : '#CBD5E1', minHeight: '1.5em' }}
              initial={{ opacity: 0, x: -8 }}
              animate={visibleLines > i ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
              transition={{ duration: 0.3, ease: 'circOut' }}
            >
              {line || '\u00A0'}
              {visibleLines === i + 1 && i < EMAIL_LINES.length - 1 && (
                <motion.span
                  style={{ display: 'inline-block', width: '2px', height: '1em', background: '#2563EB', marginLeft: '1px', verticalAlign: 'text-bottom' }}
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                />
              )}
            </motion.p>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
