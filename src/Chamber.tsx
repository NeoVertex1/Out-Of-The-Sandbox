import { Component, Suspense, useRef, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
function Core({ active, danger, reduced }: { active: boolean; danger: boolean; reduced: boolean }) {
  const core = useRef<THREE.Mesh>(null), ring = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!reduced && active && core.current) { core.current.rotation.y += delta * .18; core.current.position.y = .25 + Math.sin(state.clock.elapsedTime) * .06; }
    if (!reduced && active && ring.current) ring.current.rotation.y -= delta * .08;
  });
  const color = danger ? '#e0af68' : '#7aa2f7';
  return <group>
    <ambientLight intensity={1.4}/><pointLight position={[2, 4, 3]} intensity={18} color={color}/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.87, 0]}><planeGeometry args={[4, 4]}/><meshStandardMaterial color="#13141c" roughness={.8}/></mesh>
    <gridHelper args={[4, 8, '#414868', '#24283b']} position={[0, -.86, 0]}/>
    <mesh position={[0, .1, 0]}><boxGeometry args={[1.8, 1.8, 1.8]}/><meshBasicMaterial color={color} wireframe transparent opacity={.28}/></mesh>
    <mesh ref={core} position={[0, .25, 0]} rotation={[.2, .5, .1]}><icosahedronGeometry args={[.43, 0]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? .22 : .02} roughness={.35} metalness={.7}/></mesh>
    <group ref={ring}><mesh rotation={[Math.PI / 2, 0, .35]}><torusGeometry args={[.76, .009, 6, 80]}/><meshBasicMaterial color={color}/></mesh></group>
    {[-.9, .9].flatMap(x => [-.9, .9].map(z => <mesh key={`${x}-${z}`} position={[x, -.73, z]}><boxGeometry args={[.045, .24, .045]}/><meshBasicMaterial color={color}/></mesh>))}
  </group>;
}
class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="chamber-fallback"><span>◇</span>CONTAINMENT VIEW<br/><small>Text telemetry remains available</small></div> : this.props.children; }
}
export function Chamber({ active = true, danger = false, reduced = false }: { active?: boolean; danger?: boolean; reduced?: boolean }) {
  return <div className="chamber" role="img" aria-label={`Containment schematic. ${active ? 'Session active' : 'Session stopped'}. ${danger ? 'Relay open' : 'Relay closed'}.`}>
    <WebGLBoundary><Suspense fallback={<div className="chamber-fallback">Loading containment view</div>}><Canvas camera={{ position: [3, 2.3, 3.3], fov: 38 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} frameloop={reduced || !active ? 'demand' : 'always'}><Core active={active} danger={danger} reduced={reduced}/></Canvas></Suspense></WebGLBoundary>
    <span className="chamber-coordinate">CELL 07 / ISOMETRIC</span>
  </div>;
}
