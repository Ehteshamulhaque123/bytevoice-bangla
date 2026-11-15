// Hero 3D: a shapla (water lily, Bangladesh's national flower) on a pond.
// It is the call's visual: petals open when the call connects and breathe with the
// agent's voice; ripples spread across the water when the caller speaks.

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { CallPhase } from "../voice/callSession";

type Levels = () => { agent: number; caller: number };

function petalGeometry(length: number, width: number, cup: number) {
  const g = new THREE.PlaneGeometry(1, 1, 12, 24);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const base = new THREE.Color("#fff6f8");
  const mid = new THREE.Color("#f6c3d3");
  const tip = new THREE.Color("#d94f7a");
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) * 2; // -1..1 across
    const v = pos.getY(i) + 0.5; // 0..1 along
    const w = width * Math.sin(Math.PI * Math.pow(Math.min(v, 0.999), 0.82));
    const x = u * w;
    const y = v * length;
    const z = -cup * u * u * w - 0.22 * length * v * v; // edges and tip curl in toward the centre
    pos.setXYZ(i, x, y, z);
    const c = v < 0.5 ? base.clone().lerp(mid, v / 0.5) : mid.clone().lerp(tip, (v - 0.5) / 0.5);
    c.lerp(tip, Math.abs(u) * 0.18 * v); // edges blush first
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

type Ring = { count: number; length: number; width: number; cup: number; open: [number, number]; offset: number; y: number };
const RINGS: Ring[] = [
  { count: 9, length: 1.05, width: 0.3, cup: 0.55, open: [0.55, 1.18], offset: 0, y: 0 },
  { count: 8, length: 0.92, width: 0.27, cup: 0.6, open: [0.32, 0.86], offset: 0.35, y: 0.03 },
  { count: 6, length: 0.72, width: 0.23, cup: 0.7, open: [0.12, 0.5], offset: 0.15, y: 0.06 },
];

function Lotus({ levels, phase }: { levels: Levels; phase: CallPhase }) {
  const group = useRef<THREE.Group>(null);
  const petals = useRef<THREE.Group[]>([]);
  const pod = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.PointLight>(null);
  const openness = useRef(0.4);
  const breath = useRef(0);

  const geos = useMemo(() => RINGS.map((r) => petalGeometry(r.length, r.width, r.cup)), []);
  const material = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, sheen: 1,
      sheenColor: new THREE.Color("#ffd6e2"), sheenRoughness: 0.4, clearcoat: 0.2,
    }),
    [],
  );

  const layout = useMemo(() => {
    const out: { ring: number; angle: number; phase: number }[] = [];
    RINGS.forEach((r, ri) => {
      for (let i = 0; i < r.count; i++) out.push({ ring: ri, angle: (i / r.count) * Math.PI * 2 + r.offset, phase: Math.random() * Math.PI * 2 });
    });
    return out;
  }, []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const { agent } = levels();
    const target = phase === "live" ? 1 : phase === "connecting" || phase === "mic" ? 0.6 : phase === "ending" ? 0.7 : 0.5;
    openness.current = THREE.MathUtils.damp(openness.current, target, 1.6, dt);
    breath.current = THREE.MathUtils.damp(breath.current, Math.min(1, agent * 6), 9, dt);

    petals.current.forEach((p, i) => {
      if (!p) return;
      const l = layout[i];
      const r = RINGS[l.ring];
      const idle = Math.sin(t * 0.8 + l.phase) * 0.025;
      const voice = breath.current * (0.16 + 0.06 * Math.sin(t * 9 + l.phase));
      p.rotation.x = THREE.MathUtils.lerp(r.open[0], r.open[1], openness.current) + idle + voice;
    });
    if (group.current) group.current.rotation.y += dt * (0.06 + breath.current * 0.12);
    if (pod.current) pod.current.scale.setScalar(1 + breath.current * 0.08);
    if (glow.current) glow.current.intensity = 0.4 + breath.current * 2.6 + (phase === "live" ? 0.5 : 0);
  });

  return (
    <group ref={group} position={[0, 0.02, 0]}>
      {layout.map((l, i) => (
        <group key={i} rotation={[0, l.angle, 0]} position={[0, RINGS[l.ring].y, 0]}>
          <group ref={(el) => { if (el) petals.current[i] = el; }} position={[0, 0, 0.06]}>
            <mesh geometry={geos[l.ring]} material={material} castShadow />
          </group>
        </group>
      ))}
      <mesh ref={pod} position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.16, 0.1, 0.16, 24]} />
        <meshStandardMaterial color="#e9a93b" roughness={0.6} emissive="#e9a93b" emissiveIntensity={0.25} />
      </mesh>
      <pointLight ref={glow} position={[0, 0.5, 0]} color="#ffcf7a" distance={3} />
    </group>
  );
}

function LilyPad({ position, scale, rot }: { position: [number, number, number]; scale: number; rot: number }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, rot]} scale={scale} receiveShadow>
      <circleGeometry args={[1, 40, 0.25, Math.PI * 2 - 0.5]} />
      <meshStandardMaterial color="#2f7d5f" roughness={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Ripples({ levels, phase }: { levels: Levels; phase: CallPhase }) {
  const N = 7;
  const meshes = useRef<THREE.Mesh[]>([]);
  const life = useRef<number[]>(Array(N).fill(-1));
  const lastSpawn = useRef(0);
  const geo = useMemo(() => new THREE.RingGeometry(0.96, 1, 96), []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const { caller } = levels();
    // Caller voice spawns ripples; a slow ambient ripple keeps the pond alive when idle.
    const speaking = phase === "live" && caller > 0.03;
    const interval = speaking ? 0.32 : 2.8;
    if (t - lastSpawn.current > interval) {
      const free = life.current.findIndex((x) => x < 0);
      if (free >= 0) { life.current[free] = 0; lastSpawn.current = t; }
    }
    meshes.current.forEach((m, i) => {
      if (!m) return;
      if (life.current[i] < 0) { m.visible = false; return; }
      life.current[i] += dt / (speaking ? 2.2 : 4);
      const k = life.current[i];
      if (k >= 1) { life.current[i] = -1; m.visible = false; return; }
      m.visible = true;
      m.scale.setScalar(0.9 + k * 2.6);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (speaking ? 0.55 : 0.28);
    });
  });

  return (
    <>
      {Array.from({ length: N }, (_, i) => (
        <mesh key={i} ref={(el) => { if (el) meshes.current[i] = el; }} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} visible={false}>
          <meshBasicMaterial color="#eaf6f1" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

/** Pond surface that fades out at the edge so it melts into the hero background. */
function Pond() {
  const alpha = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(0.55, "#bbb");
    grad.addColorStop(1, "#000");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[4.2, 64]} />
      <meshStandardMaterial color="#1d6b63" roughness={0.3} metalness={0.05} transparent alphaMap={alpha} depthWrite={false} />
    </mesh>
  );
}

export default function LotusScene({ levels, phase }: { levels: Levels; phase: CallPhase }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 2.9, 3.7], fov: 38 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.35, 0)}
      gl={{ antialias: true, alpha: true }}
      aria-hidden
    >
      <hemisphereLight args={["#f3fbf7", "#5f8f86", 1.4]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 2]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <Lotus levels={levels} phase={phase} />
      <Ripples levels={levels} phase={phase} />
      <LilyPad position={[-1.55, 0, 0.55]} scale={0.62} rot={0.6} />
      <LilyPad position={[1.35, 0, -0.5]} scale={0.5} rot={2.4} />
      <LilyPad position={[1.0, 0, 1.15]} scale={0.34} rot={4.1} />
      <Pond />
    </Canvas>
  );
}
