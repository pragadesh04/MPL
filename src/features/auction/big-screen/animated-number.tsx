'use client';

import { useEffect } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { formatAmount } from '@/lib/money';

/** A number that rolls to each new value (the big-screen bid counter). Jumps under reduced motion. */
export interface AnimatedNumberProps {
  value: number;
  className?: string;
}

export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const spring = useSpring(value, { stiffness: 160, damping: 22 });
  const text = useTransform(spring, (v) => formatAmount(Math.round(v)));

  useEffect(() => {
    if (reduce) spring.jump(value);
    else spring.set(value);
  }, [value, reduce, spring]);

  return (
    <motion.span aria-hidden="true" className={className}>
      {text}
    </motion.span>
  );
}
