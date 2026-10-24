'use client';

import { motion, useScroll, useSpring } from 'motion/react';

// Based on the reference file: App.tsx (useScroll + useSpring progress bar)
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 20,
    mass: 0.2,
  });

  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 origin-left bg-gradient-to-r from-indigo-500 via-cyan-400 to-violet-500 shadow-[0_0_18px_rgba(79,70,229,0.7)]"
      style={{ scaleX }}
    />
  );
}
