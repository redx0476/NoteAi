'use client';

import { motion, useReducedMotion } from 'framer-motion';

// A reusable animated wrapper that fades/slides content in as it scrolls into
// view. Respects the user's reduced-motion preference.
export default function Section({ as = 'section', children, className = '', delay = 0, ...rest }) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] || motion.section;

  return (
    <MotionTag
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={reduce ? {} : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}
