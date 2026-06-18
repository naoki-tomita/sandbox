import { useEffect, useState } from 'react';
import { Circle, Text, View } from './index';
import type { Style } from './index';

const palette = {
  bg: '#0d0d1a',
  panel: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.14)',
  accent: '#6699ff',
  text: '#ffffff',
  muted: 'rgba(255,255,255,0.5)',
};

function Button({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const [hover, setHover] = useState(false);
  const style: Style = {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: hover ? palette.accent : 'rgba(102,153,255,0.15)',
    borderColor: palette.accent,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  };
  return (
    <View
      style={style}
      onClick={onPress}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <Text style={{ fontSize: 28, color: palette.text, fontWeight: 700 }}>
        {label}
      </Text>
    </View>
  );
}

/** A small interactive scene rendered entirely to canvas via React. */
export function Demo() {
  const [count, setCount] = useState(0);
  const [t, setT] = useState(0);

  // Animate purely through React state — every frame is a re-render.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setT((v) => v + 0.02);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const orbit = 70;
  const dots = Array.from({ length: 6 }, (_, i) => {
    const a = t + (i / 6) * Math.PI * 2;
    return { i, x: Math.cos(a) * orbit, y: Math.sin(a) * orbit };
  });

  return (
    <View
      style={{
        width: 640,
        height: 420,
        padding: 28,
        flexDirection: 'column',
        gap: 22,
      }}
    >
      <Text style={{ fontSize: 30, color: palette.text, fontWeight: 700 }}>
        canvas-renderer
      </Text>
      <Text style={{ fontSize: 15, color: palette.muted }}>
        React components drawn straight to a 2D canvas — no DOM.
      </Text>

      <View style={{ flexDirection: 'row', gap: 24, alignItems: 'center' }}>
        <View
          style={{
            width: 300,
            height: 220,
            borderRadius: 16,
            backgroundColor: palette.panel,
            borderColor: palette.border,
            borderWidth: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
          }}
        >
          <Text style={{ fontSize: 64, color: palette.accent, fontWeight: 700 }}>
            {String(count)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Button label="-" onPress={() => setCount((c) => c - 1)} />
            <Button label="+" onPress={() => setCount((c) => c + 1)} />
          </View>
        </View>

        {/* Orbiting dots: a relative box with absolutely-placed circles. */}
        <View
          style={{
            width: 220,
            height: 220,
            borderRadius: 16,
            backgroundColor: palette.panel,
            borderColor: palette.border,
            borderWidth: 1,
          }}
        >
          {dots.map((d) => (
            <Circle
              key={d.i}
              style={{
                position: 'absolute',
                left: 110 + d.x - 9,
                top: 110 + d.y - 9,
                radius: 9,
                backgroundColor: palette.accent,
                opacity: 0.4 + (d.i / 6) * 0.6,
              }}
            />
          ))}
          <Circle
            style={{
              position: 'absolute',
              left: 110 - 6,
              top: 110 - 6,
              radius: 6,
              backgroundColor: palette.text,
            }}
          />
        </View>
      </View>
    </View>
  );
}
