'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const STRENGTH_LEVELS = [
  { label: 'Very Weak', color: '#b91c1c', barClass: 'bg-red-700' },
  { label: 'Weak', color: '#c2410c', barClass: 'bg-orange-600' },
  { label: 'Okay', color: '#ca8a04', barClass: 'bg-yellow-500' },
  { label: 'Solid', color: '#15803d', barClass: 'bg-green-600' },
  { label: 'Godly', color: '#7e22ce', barClass: 'bg-purple-700' },
] as const;

export function evaluatePasswordStrength(value: string) {
  if (!value) {
    return {
      score: 0,
      feedback:
        'Use 12+ characters with mixed letter case, numbers, and symbols.',
    };
  }

  let points = 0;
  if (value.length >= 8) points += 1;
  if (value.length >= 12) points += 1;
  if (/[a-z]/.test(value)) points += 1;
  if (/[A-Z]/.test(value)) points += 1;
  if (/\d/.test(value)) points += 1;
  if (/[^A-Za-z0-9]/.test(value)) points += 1;
  if (!/(.)\1{2,}/.test(value)) points += 1;
  if (!/^(password|123456|qwerty|letmein)/i.test(value)) points += 1;

  if (value.length < 8)
    return { score: 0, feedback: 'Too short. Use at least 8 characters.' };
  if (points <= 3)
    return {
      score: 1,
      feedback: 'Add uppercase letters, numbers, and symbols.',
    };
  if (points <= 5)
    return { score: 2, feedback: 'Good start. Add more variety or length.' };
  if (points <= 7)
    return {
      score: 3,
      feedback: 'Strong. A bit more length can make it even better.',
    };
  return { score: 4, feedback: 'Excellent strength and character variety.' };
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  const [strengthBoosted, setStrengthBoosted] = useState(false);
  const previousScore = useRef(0);
  const strength = useMemo(
    () => evaluatePasswordStrength(password),
    [password],
  );
  const level = STRENGTH_LEVELS[strength.score];
  const percent = ((strength.score + 1) / STRENGTH_LEVELS.length) * 100;

  useEffect(() => {
    if (strength.score > previousScore.current) {
      setStrengthBoosted(true);
      const timer = window.setTimeout(() => setStrengthBoosted(false), 260);
      previousScore.current = strength.score;
      return () => window.clearTimeout(timer);
    }
    previousScore.current = strength.score;
  }, [strength.score]);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between font-label text-xs uppercase tracking-widest text-[#43474d]">
        <span>Password strength</span>
        <span style={{ color: level.color }}>{level.label}</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-[#e7ebf1]">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${level.barClass} ${strengthBoosted ? 'scale-y-110' : ''} ${strength.score === 4 ? 'shadow-[0_0_10px_rgba(126,34,206,0.45)]' : ''}`}
          style={{ width: `${password ? percent : 0}%` }}
        />
        {strength.score === 4 && (
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-40" />
        )}
      </div>
      <p className="text-xs text-[#58616c]">{strength.feedback}</p>
    </div>
  );
}
