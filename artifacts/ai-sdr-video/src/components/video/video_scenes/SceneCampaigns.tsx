import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const CAMPAIGNS = [
  { name: 'Healthcare Q3 Blitz', status: 'Active', prospects: 12, emails: 24, booked: 3, color: '#10B981' },
  { name: 'Office Park Outreach', status: 'Active', prospects: 8, emails: 15, booked: 1, color: '#10B981' },
  { name: 'Tech Campus Expansion', status: 'Draft', prospects: 22, emails: 0, booked: 0, color: '#F59E0B' },
];

export function SceneCampaigns() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 650);
    const t3 = setTimeout(() => setPhase(3), 1100);
    const t4 = setTimeout(() => setPhase(4), 1550);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.35 } }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="pl-[6vw] pr-[6vw] mb-[3vh]">
        <motion.p
          className="font-semibold tracking-[0.25em] uppercase mb-[1vh]"
          style={{ fontSize: '1.2vw', color: '#38BDF8', fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
        >
          Campaign Management
        </motion.p>
        <motion.h2
          className="font-black leading-tight"
          style={{ fontSize: '4vw', color: '#F8FAFC', fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: 15 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{ duration: 0.45, delay: 0.08 }}
        >
          Every campaign. Every metric.{' '}
          <span style={{ color: '#2563EB' }}>One view.</span>
        </motion.h2>
      </div>

      {/* Campaign cards */}
      <div className="px-[6vw] grid grid-cols-3 gap-[2vw]">
        {CAMPAIGNS.map((c, i) => (
          <motion.div
            key={c.name}
            className="rounded-2xl p-[2vw]"
            style={{
              background: 'rgba(15,31,61,0.85)',
              border: '1px solid rgba(37,99,235,0.2)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
            initial={{ opacity: 0, y: 40, scale: 0.94 }}
            animate={phase >= i + 2 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.94 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-start justify-between mb-[1.5vh]">
              <h3
                className="font-bold leading-tight"
                style={{ fontSize: '1.4vw', color: '#F8FAFC', fontFamily: 'var(--font-display)' }}
              >
                {c.name}
              </h3>
              <span
                className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ml-2"
                style={{
                  background: c.status === 'Active' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                  color: c.status === 'Active' ? '#10B981' : '#F59E0B',
                  fontSize: '0.8vw',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {c.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Prospects', val: c.prospects, icon: '👥' },
                { label: 'Emails', val: c.emails, icon: '✉️' },
                { label: 'Booked', val: c.booked, icon: '📅' },
              ].map(stat => (
                <div key={stat.label} className="text-center">
                  <p
                    className="font-black"
                    style={{
                      fontSize: '2.2vw',
                      color: stat.label === 'Booked' && stat.val > 0 ? '#38BDF8' : '#F8FAFC',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    {stat.val}
                  </p>
                  <p style={{ fontSize: '0.75vw', color: '#64748B', fontFamily: 'var(--font-body)' }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="mt-[1.5vh] h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, #2563EB, #38BDF8)` }}
                initial={{ width: 0 }}
                animate={phase >= i + 2 ? { width: `${Math.min(100, (c.booked / Math.max(c.prospects, 1)) * 100 * 10 + 20)}%` } : { width: 0 }}
                transition={{ duration: 0.8, delay: 0.3, ease: 'circOut' }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
