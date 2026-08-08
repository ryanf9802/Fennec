import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Shape,
  Vector3,
} from 'three';
import type { SpatialEventPoint } from '../domain/analytics';
import type { ArenaProfile } from '../domain/arenaProfiles';
import {
  arenaWallPanels,
  gameToScene,
  type TouchMapCameraState,
} from '../domain/touchMapGeometry';

const fieldColor = '#64748b';
const blueTeamColor = '#22d3ee';
const orangeTeamColor = '#fb923c';

function teamColor(teamNumber: number): string {
  return teamNumber === 1 ? orangeTeamColor : blueTeamColor;
}

function CameraRig({ state }: { state: TouchMapCameraState }) {
  const { camera, invalidate, size } = useThree();
  useEffect(() => {
    const radians = (state.pitch * Math.PI) / 180;
    const framedDistance =
      state.distance *
      Math.max(1, size.height / Math.max(1, size.width)) *
      1.15;
    const target = new Vector3(state.targetX, 0, state.targetZ);
    camera.position.set(
      state.targetX,
      Math.cos(radians) * framedDistance,
      state.targetZ + Math.sin(radians) * framedDistance,
    );
    camera.up.set(0, Math.sin(radians), -Math.cos(radians));
    camera.lookAt(target);
    invalidate();
  }, [camera, invalidate, size, state]);
  return null;
}

function Floor({ profile }: { profile: ArenaProfile }) {
  const shape = useMemo(() => {
    const next = new Shape();
    profile.footprint.forEach(([x, y], index) => {
      if (index === 0) next.moveTo(y, -x);
      else next.lineTo(y, -x);
    });
    next.closePath();
    return next;
  }, [profile]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color="#132338" roughness={0.9} />
      </mesh>
      <mesh position={[0, 5, 0]}>
        <boxGeometry args={[18, 8, profile.xMax - profile.xMin]} />
        <meshBasicMaterial color={fieldColor} transparent opacity={0.72} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 6, 0]}>
        <ringGeometry args={[900, 920, 64]} />
        <meshBasicMaterial
          color={fieldColor}
          transparent
          opacity={0.72}
          side={DoubleSide}
        />
      </mesh>
    </>
  );
}

function WallPanel({
  start,
  end,
  zMin,
  zMax,
}: ReturnType<typeof arenaWallPanels>[number]) {
  const startX = start[1];
  const startZ = start[0];
  const endX = end[1];
  const endZ = end[0];
  const dx = endX - startX;
  const dz = endZ - startZ;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(-dz, dx);
  return (
    <mesh
      position={[(startX + endX) / 2, (zMin + zMax) / 2, (startZ + endZ) / 2]}
      rotation={[0, angle, 0]}
    >
      <boxGeometry args={[length, zMax - zMin, 18]} />
      <meshStandardMaterial
        color={fieldColor}
        transparent
        opacity={0.16}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

function GoalTunnels({ profile }: { profile: ArenaProfile }) {
  if (!profile.goal) return null;
  const { halfWidth, height, depth } = profile.goal;
  return (
    <>
      {([-1, 1] as const).map((side) => {
        const wallY = side < 0 ? profile.yMin : profile.yMax;
        const centerX = wallY + side * (depth / 2);
        const backX = wallY + side * depth;
        const color = teamColor(side < 0 ? 0 : 1);
        return (
          <group key={side}>
            <mesh position={[centerX, -8, 0]}>
              <boxGeometry args={[depth, 16, halfWidth * 2]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.08}
                roughness={0.82}
              />
            </mesh>
            {([-1, 1] as const).map((goalSide) => (
              <mesh
                key={goalSide}
                position={[centerX, height / 2, goalSide * halfWidth]}
              >
                <boxGeometry args={[depth, height, 18]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={0.12}
                  transparent
                  opacity={0.42}
                  depthWrite={false}
                />
              </mesh>
            ))}
            <mesh position={[backX, height / 2, 0]}>
              <boxGeometry args={[18, height, halfWidth * 2]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.12}
                transparent
                opacity={0.42}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[centerX, height, 0]}>
              <boxGeometry args={[depth, 18, halfWidth * 2]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.12}
                transparent
                opacity={0.42}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function Hoops({ profile }: { profile: ArenaProfile }) {
  if (profile.kind !== 'hoops') return null;
  return (
    <>
      {([-1, 1] as const).map((side) => {
        const color = teamColor(side < 0 ? 0 : 1);
        return (
          <mesh
            key={side}
            position={[side * (profile.yMax - 180), 650, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[360, 24, 12, 48]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.25}
            />
          </mesh>
        );
      })}
    </>
  );
}

function Field({ profile }: { profile: ArenaProfile }) {
  return (
    <group>
      <Floor profile={profile} />
      {arenaWallPanels(profile).map((panel, index) => (
        <WallPanel key={index} {...panel} />
      ))}
      <GoalTunnels profile={profile} />
      <Hoops profile={profile} />
    </group>
  );
}

function ActiveGuide({ point }: { point: SpatialEventPoint }) {
  const position = gameToScene(point);
  const object = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        [position.x, 8, position.z, position.x, position.y, position.z],
        3,
      ),
    );
    return new LineSegments(
      geometry,
      new LineBasicMaterial({
        color: '#f8fafc',
        transparent: true,
        opacity: 0.7,
      }),
    );
  }, [position.x, position.y, position.z]);
  useEffect(
    () => () => {
      object.geometry.dispose();
      (object.material as LineBasicMaterial).dispose();
    },
    [object],
  );
  return <primitive object={object} />;
}

function Marker({
  point,
  active,
  onActivate,
}: {
  point: SpatialEventPoint;
  active: boolean;
  onActivate(id?: string): void;
}) {
  const position = gameToScene(point);
  const team = point.actors[0]?.teamNumber;
  const color = point.kind === 'goal' ? '#facc15' : teamColor(team ?? 0);
  const activate = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onActivate(point.id);
  };
  return (
    <group>
      <mesh
        position={[position.x, position.y, position.z]}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={activate}
        onPointerEnter={activate}
        onPointerLeave={(event) => {
          event.stopPropagation();
          onActivate(undefined);
        }}
      >
        {point.kind === 'goal' ? (
          <octahedronGeometry args={[active ? 150 : 115, 0]} />
        ) : (
          <sphereGeometry args={[active ? 125 : 91.25, 20, 14]} />
        )}
        <meshStandardMaterial
          color={new Color(color)}
          emissive={active ? color : '#000000'}
          emissiveIntensity={active ? 0.28 : 0}
          roughness={0.38}
        />
      </mesh>
      {active && <ActiveGuide point={point} />}
    </group>
  );
}

function Scene({
  profile,
  points,
  cameraState,
  activeId,
  onActivate,
}: BallTouchSceneProps) {
  return (
    <>
      <color attach="background" args={['#0d1726']} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[-5000, 9000, 3500]} intensity={2.2} />
      <Field profile={profile} />
      {points.map((point) => (
        <Marker
          key={point.id}
          point={point}
          active={point.id === activeId}
          onActivate={onActivate}
        />
      ))}
      <CameraRig state={cameraState} />
    </>
  );
}

export interface BallTouchSceneProps {
  profile: ArenaProfile;
  points: SpatialEventPoint[];
  cameraState: TouchMapCameraState;
  activeId?: string;
  onActivate(id?: string): void;
}

export function BallTouchScene(props: BallTouchSceneProps) {
  return (
    <Canvas
      role="img"
      aria-label={`${props.profile.label} 3D ball touch map`}
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ fov: 42, near: 10, far: 100_000 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
