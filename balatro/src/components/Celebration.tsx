import { useMemo } from 'react';

const COLORS = ['#f1c40f', '#e74c3c', '#2ecc71', '#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#ff6b9d'];

export function Celebration() {
  const particles = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      color: COLORS[i % COLORS.length],
      left: `${2 + (i / 60) * 96}%`,
      size: `${6 + (i % 6) * 3}px`,
      duration: `${0.9 + (i % 8) * 0.15}s`,
      delay: `${(i % 12) * 0.06}s`,
      borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '2px' : '0',
      rotateEnd: i % 2 === 0 ? 540 : -540,
    }))
  , []);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 200, overflow: 'hidden' }}>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: '-24px',
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.borderRadius,
            animation: `confettiFall ${p.duration} ease-in ${p.delay} forwards`,
          }}
        />
      ))}
      <div style={{
        position: 'absolute',
        inset: 0,
        animation: 'goldenFlash 0.6s ease-out forwards',
        pointerEvents: 'none',
      }} />
    </div>
  );
}
