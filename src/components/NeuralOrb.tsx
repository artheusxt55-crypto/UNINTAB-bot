import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface NeuralOrbProps {
  isActive: boolean;
  volume: number;
  frequency: number;
  isProcessing: boolean;
  size?: "sm" | "md" | "lg";
}

function StardustParticles({ volume, isActive, isProcessing }: { volume: number; isActive: boolean; isProcessing: boolean }) {
  const particles = useMemo(() => {
    const colors = [
      "hsl(var(--neural-red))",
      "hsl(var(--neural-crimson))",
      "hsl(var(--neural-ember))",
      "hsl(var(--neural-scarlet))",
      "hsl(var(--foreground) / 0.3)",
    ];
    const result: any[] = [];
    let id = 0;
    for (let i = 0; i < 12; i++) result.push({ id: id++, angle: (i/12)*Math.PI*2+Math.random()*0.4, distance: 100+Math.random()*25, size: 1+Math.random()*1.5, color: colors[i%colors.length], ring: 0 });
    for (let i = 0; i < 16; i++) result.push({ id: id++, angle: (i/16)*Math.PI*2+Math.random()*0.5, distance: 135+Math.random()*35, size: 1.5+Math.random()*2, color: colors[i%colors.length], ring: 1 });
    for (let i = 0; i < 14; i++) result.push({ id: id++, angle: (i/14)*Math.PI*2+Math.random()*0.6, distance: 175+Math.random()*50, size: 2+Math.random()*3, color: colors[i%colors.length], ring: 2 });
    return result;
  }, []);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 z-0" style={{ width: 500, height: 500, left: -160, top: -160 }}>
      {particles.map((p) => {
        const jitter = volume * (p.ring === 0 ? 20 : p.ring === 1 ? 35 : 50);
        const processingExtra = isProcessing ? 20 : 0;
        const dist = p.distance + jitter + processingExtra;
        const x = 250 + Math.cos(p.angle) * dist;
        const y = 250 + Math.sin(p.angle) * dist;
        return (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              width: p.size, height: p.size,
              backgroundColor: p.color,
              boxShadow: `0 0 ${4 + volume * 8}px ${p.color}`,
              filter: `blur(${p.ring}px)`,
              left: -p.size / 2, top: -p.size / 2,
            }}
            animate={{
              x, y,
              opacity: (p.ring === 2 ? 0.15 : p.ring === 1 ? 0.3 : 0.5) + volume * 0.4 + (isProcessing ? 0.15 : 0),
              scale: 1 + volume * (p.ring === 0 ? 1.2 : 0.6),
            }}
            transition={{ type: "spring", stiffness: 30 + volume * 50, damping: 6 + p.ring * 2, mass: 0.4 + p.ring * 0.2 }}
          />
        );
      })}
    </div>
  );
}

function OrbitalRings({ isActive, volume, isProcessing }: { isActive: boolean; volume: number; isProcessing: boolean }) {
  if (!isActive) return null;
  const rings = [
    { size: 260, tiltX: 65, tiltY: 15, duration: 10, opacity: 0.35, width: 1.2, color: "var(--neural-red)" },
    { size: 300, tiltX: 72, tiltY: -25, duration: 14, opacity: 0.25, width: 1, color: "var(--neural-crimson)" },
    { size: 340, tiltX: 58, tiltY: 40, duration: 18, opacity: 0.18, width: 0.8, color: "var(--neural-ember)" },
    { size: 220, tiltX: 80, tiltY: -10, duration: 8, opacity: 0.3, width: 1.5, color: "var(--neural-scarlet)" },
  ];

  return (
    <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
      {rings.map((ring, i) => {
        const dynamicOpacity = ring.opacity + volume * 0.3 + (isProcessing ? 0.15 : 0);
        const speed = ring.duration - volume * 4;
        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: ring.size, height: ring.size,
              border: `${ring.width}px solid hsl(${ring.color} / ${dynamicOpacity})`,
              boxShadow: `0 0 ${6 + volume * 10}px hsl(${ring.color} / ${dynamicOpacity * 0.5}), inset 0 0 ${4 + volume * 6}px hsl(${ring.color} / ${dynamicOpacity * 0.3})`,
              transform: `rotateX(${ring.tiltX}deg) rotateY(${ring.tiltY}deg)`,
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: dynamicOpacity, scale: 1 + volume * 0.08, rotate: [0, 360] }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{
              opacity: { type: "spring", stiffness: 60, damping: 15 },
              scale: { type: "spring", stiffness: 60, damping: 15 },
              rotate: { duration: Math.max(speed, 4), repeat: Infinity, ease: "linear" },
            }}
          />
        );
      })}
    </div>
  );
}

export default function NeuralOrb({ isActive, volume, frequency, isProcessing, size = "lg" }: NeuralOrbProps) {
  const scale = isActive ? 1 + volume * 0.6 : 0;
  const glowIntensity = isActive ? 0.4 + volume * 0.6 : 0;
  const gradientRotation = frequency * 360;

  const sizeMap = { sm: 0.4, md: 0.65, lg: 1 };
  const s = sizeMap[size];

  const blobPath = useMemo(() => {
    const points = 8;
    const slice = (Math.PI * 2) / points;
    return Array.from({ length: points }, (_, i) => {
      const baseRadius = 50;
      const noise = Math.sin(i * 2.7 + frequency * 10) * 3 + Math.cos(i * 1.3) * 2;
      const r = baseRadius + noise + volume * 8;
      const angle = slice * i;
      return `${50 + r * Math.cos(angle)}% ${50 + r * Math.sin(angle)}%`;
    }).join(", ");
  }, [volume, frequency]);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="relative flex items-center justify-center"
          style={{ transform: `scale(${s})` }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: s, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        >
          {/* Glow layers */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 360, height: 360,
              background: `radial-gradient(circle, hsl(var(--neural-red) / ${0.15+volume*0.1}) 0%, hsl(var(--neural-ember) / ${0.08+volume*0.05}) 30%, transparent 65%)`,
              filter: `blur(${50+volume*30}px)`,
            }}
            animate={{
              scale: volume < 0.08 ? [scale*1.8, scale*1.9, scale*1.8] : scale*1.8,
              opacity: volume < 0.08 ? [glowIntensity*0.25, glowIntensity*0.4, glowIntensity*0.25] : glowIntensity*0.25,
            }}
            transition={volume < 0.08 ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : { type: "spring", stiffness: 40, damping: 20 }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 300, height: 300,
              background: `radial-gradient(circle, hsl(var(--neural-crimson) / ${0.3+volume*0.2}) 0%, hsl(var(--neural-red) / ${0.15+volume*0.1}) 40%, transparent 70%)`,
              filter: `blur(${35+volume*20}px)`,
            }}
            animate={{ scale: scale*1.5, opacity: glowIntensity*0.4 }}
            transition={{ type: "spring", stiffness: 60, damping: 18 }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 240, height: 240,
              background: `conic-gradient(from 0deg, hsl(var(--neural-red) / 0.4) 0%, hsl(var(--neural-ember) / 0.25) 25%, hsl(var(--neural-crimson) / 0.35) 50%, hsl(var(--neural-scarlet) / 0.2) 75%, hsl(var(--neural-red) / 0.4) 100%)`,
              filter: `blur(${20+volume*12}px)`,
            }}
            animate={{ scale: scale*1.25, opacity: glowIntensity*0.6, rotate: [0, 360] }}
            transition={{
              scale: { type: "spring", stiffness: 80, damping: 15 },
              rotate: { duration: 12, repeat: Infinity, ease: "linear" },
            }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 200, height: 200,
              background: `conic-gradient(from 180deg, hsl(var(--neural-crimson) / 0.5) 0%, hsl(var(--neural-red) / 0.4) 30%, hsl(var(--neural-ember) / 0.5) 60%, hsl(var(--neural-crimson) / 0.5) 100%)`,
              filter: `blur(${12+volume*8}px)`,
            }}
            animate={{ scale: scale*1.05, opacity: glowIntensity*0.8, rotate: [360, 0] }}
            transition={{
              scale: { type: "spring", stiffness: 100, damping: 12 },
              rotate: { duration: 8, repeat: Infinity, ease: "linear" },
            }}
          />

          {/* Main orb */}
          <motion.div
            className="relative z-10 rounded-full"
            style={{
              width: 180, height: 180,
              clipPath: `polygon(${blobPath})`,
              background: `conic-gradient(from ${gradientRotation}deg, hsl(var(--neural-red)) 0%, hsl(var(--neural-ember)) ${20+volume*15}%, hsl(var(--neural-crimson)) ${45+volume*10}%, ${isProcessing ? "hsl(var(--neural-scarlet))" : "hsl(var(--neural-red))"} ${70+volume*10}%, hsl(var(--neural-red)) 100%)`,
              filter: `blur(${1.5+volume*0.5}px)`,
            }}
            animate={{
              scale: volume < 0.08 ? [scale, scale*1.07, scale] : scale,
              rotate: [0, 360],
            }}
            transition={{
              scale: volume < 0.08 ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : { type: "spring", stiffness: 150, damping: 12 },
              rotate: { duration: 20 - volume*12, repeat: Infinity, ease: "linear" },
            }}
          />

          {/* Fluid overlay */}
          <motion.div
            className="absolute z-10 rounded-full"
            style={{
              width: 170, height: 170,
              mixBlendMode: "soft-light",
              clipPath: `polygon(${blobPath})`,
              background: `conic-gradient(from 90deg, hsl(var(--neural-ember) / 0.8) 0%, hsl(var(--neural-scarlet) / 0.6) 33%, hsl(var(--neural-crimson) / 0.7) 66%, hsl(var(--neural-ember) / 0.8) 100%)`,
              filter: `blur(${3+volume*2}px)`,
            }}
            animate={{ scale: scale*0.95, rotate: [360, 0], opacity: 0.5+volume*0.3 }}
            transition={{
              scale: { type: "spring", stiffness: 150, damping: 12 },
              rotate: { duration: 14, repeat: Infinity, ease: "linear" },
            }}
          />

          {/* Flash */}
          <motion.div
            className="absolute z-20 rounded-full"
            style={{ width: 100, height: 100, background: "hsl(var(--neural-scarlet))", filter: "blur(25px)" }}
            animate={{
              scale: isProcessing ? 0.8 : volume > 0.7 ? 0.5 : 0,
              opacity: isProcessing ? 0.6 : volume > 0.7 ? volume*0.4 : 0,
            }}
            transition={{ duration: 0.15 }}
          />

          <OrbitalRings isActive={isActive} volume={volume} isProcessing={isProcessing} />
          <StardustParticles volume={volume} isActive={isActive} isProcessing={isProcessing} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
