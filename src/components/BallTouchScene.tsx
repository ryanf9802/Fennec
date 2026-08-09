import {
  Canvas,
  type ThreeEvent,
  useFrame,
  useThree,
} from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  LinearFilter,
  type Mesh,
  Shape,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { SpatialEventPoint } from '../domain/analytics';
import type { ArenaProfile } from '../domain/arenaProfiles';
import {
  arenaWallPanels,
  gameToScene,
  goalMarkerPosition,
  type TouchMapCameraState,
} from '../domain/touchMapGeometry';

const fieldColor = '#64748b';
const blueTeamColor = '#22d3ee';
const orangeTeamColor = '#fb923c';

function teamColor(teamNumber: number): string {
  return teamNumber === 1 ? orangeTeamColor : blueTeamColor;
}

function litMarkerColor(color: string, opacity: number): Color {
  const result = new Color(color);
  if (opacity < 1) result.multiplyScalar(0.18);
  return result;
}

function CameraRig({
  state,
  orientationYaw,
}: {
  state: TouchMapCameraState;
  orientationYaw: number;
}) {
  const { camera, invalidate, size } = useThree();
  useEffect(() => {
    const pitch = (state.pitch * Math.PI) / 180;
    const yaw = ((orientationYaw + state.yaw) * Math.PI) / 180;
    const framedDistance =
      state.distance *
      Math.max(1, size.height / Math.max(1, size.width)) *
      1.15;
    const target = new Vector3(state.targetX, 0, state.targetZ);
    const horizontalDistance = Math.sin(pitch) * framedDistance;
    camera.position.set(
      state.targetX + Math.sin(yaw) * horizontalDistance,
      Math.cos(pitch) * framedDistance,
      state.targetZ + Math.cos(yaw) * horizontalDistance,
    );
    camera.up.set(
      -Math.cos(pitch) * Math.sin(yaw),
      Math.sin(pitch),
      -Math.cos(pitch) * Math.cos(yaw),
    );
    camera.lookAt(target);
    invalidate();
  }, [camera, invalidate, orientationYaw, size, state]);
  return null;
}

export interface GoalLabel {
  teamNumber: number;
  label: string;
  teamName: string;
}

function GoalLabelSprite({
  goal,
  position,
}: {
  goal: GoalLabel;
  position: [number, number, number];
}) {
  const color = teamColor(goal.teamNumber);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) return new CanvasTexture(canvas);
    const radius = 24;
    context.beginPath();
    context.moveTo(radius, 4);
    context.lineTo(canvas.width - radius, 4);
    context.quadraticCurveTo(canvas.width - 4, 4, canvas.width - 4, radius);
    context.lineTo(canvas.width - 4, canvas.height - radius);
    context.quadraticCurveTo(
      canvas.width - 4,
      canvas.height - 4,
      canvas.width - radius,
      canvas.height - 4,
    );
    context.lineTo(radius, canvas.height - 4);
    context.quadraticCurveTo(4, canvas.height - 4, 4, canvas.height - radius);
    context.lineTo(4, radius);
    context.quadraticCurveTo(4, 4, radius, 4);
    context.closePath();
    context.fillStyle = 'rgba(7, 17, 31, 0.68)';
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = color;
    context.stroke();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(248, 250, 252, 0.9)';
    context.font = '800 42px "Segoe UI", sans-serif';
    context.fillText(goal.label.toUpperCase(), canvas.width / 2, 57);
    context.fillStyle = color;
    context.font = '700 32px "Segoe UI", sans-serif';
    context.fillText(goal.teamName.toUpperCase(), canvas.width / 2, 113);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.minFilter = LinearFilter;
    return result;
  }, [color, goal.label, goal.teamName]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} renderOrder={-1} scale={[1650, 510, 1]}>
      <spriteMaterial
        map={texture}
        depthTest
        depthWrite={false}
        opacity={0.82}
        transparent
      />
    </sprite>
  );
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

function GoalTunnels({
  profile,
  labels,
}: {
  profile: ArenaProfile;
  labels: GoalLabel[];
}) {
  if (!profile.goal) return null;
  const { halfWidth, height, depth } = profile.goal;
  return (
    <>
      {([-1, 1] as const).map((side) => {
        const wallY = side < 0 ? profile.yMin : profile.yMax;
        const centerX = wallY + side * (depth / 2);
        const backX = wallY + side * depth;
        const color = teamColor(side < 0 ? 0 : 1);
        const teamNumber = side < 0 ? 0 : 1;
        const label = labels.find((value) => value.teamNumber === teamNumber);
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
            {label && (
              <GoalLabelSprite
                goal={label}
                position={[centerX, height + 650, 0]}
              />
            )}
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

function Field({
  profile,
  goalLabels,
}: {
  profile: ArenaProfile;
  goalLabels: GoalLabel[];
}) {
  return (
    <group>
      <Floor profile={profile} />
      {arenaWallPanels(profile).map((panel, index) => (
        <WallPanel key={index} {...panel} />
      ))}
      <GoalTunnels labels={goalLabels} profile={profile} />
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

function GoalDisc({ active, opacity }: { active: boolean; opacity: number }) {
  const mesh = useRef<Mesh>(null);
  const { camera } = useThree();
  useFrame(() => mesh.current?.quaternion.copy(camera.quaternion));
  return (
    <mesh ref={mesh} renderOrder={4}>
      <circleGeometry args={[active ? 145 : 110, 32]} />
      <meshBasicMaterial
        color="#facc15"
        depthWrite={false}
        opacity={opacity}
        side={DoubleSide}
        transparent
      />
    </mesh>
  );
}

function FiftyMarker({
  point,
  active,
  opacity,
}: {
  point: SpatialEventPoint;
  active: boolean;
  opacity: number;
}) {
  const radius = active ? 125 : 91.25;
  const teams = [...new Set(point.actors.map((actor) => actor.teamNumber))]
    .sort((first, second) => first - second)
    .slice(0, 2);
  const colors = [teamColor(teams[0] ?? 0), teamColor(teams[1] ?? 1)];
  return (
    <>
      {colors.map((color, index) => (
        <mesh
          key={`${index}:${color}`}
          renderOrder={4}
          rotation={[0, Math.PI / 2, 0]}
        >
          <sphereGeometry args={[radius, 20, 14, index * Math.PI, Math.PI]} />
          <meshStandardMaterial
            color={litMarkerColor(color, opacity)}
            depthWrite={opacity === 1}
            emissive={active ? color : '#000000'}
            emissiveIntensity={active ? 0.28 : 0}
            opacity={opacity}
            roughness={0.38}
            transparent={opacity < 1}
          />
        </mesh>
      ))}
      {point.isScoringTouch && (
        <mesh renderOrder={5}>
          <octahedronGeometry args={[radius * 1.42, 0]} />
          <meshBasicMaterial
            color={teamColor(point.scoringTeamNumber ?? 0)}
            depthWrite={false}
            opacity={opacity}
            transparent
            wireframe
          />
        </mesh>
      )}
    </>
  );
}

/**
 * Chooses semantic geometry for one marker while keeping pointer behavior,
 * fading and active height guidance consistent.
 */
function Marker({
  profile,
  point,
  active,
  muted,
  onActivate,
}: {
  profile: ArenaProfile;
  point: SpatialEventPoint;
  active: boolean;
  muted: boolean;
  onActivate(id?: string): void;
}) {
  const position =
    point.kind === 'goal'
      ? goalMarkerPosition(profile, point)
      : gameToScene(point);
  const team = point.actors[0]?.teamNumber;
  const color = teamColor(point.scoringTeamNumber ?? team ?? 0);
  const opacity = muted ? 0.12 : 1;
  const activate = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onActivate(point.id);
  };
  return (
    <group>
      <group
        position={[position.x, position.y, position.z]}
        onPointerDown={(event) => {
          if (event.button === 0) event.stopPropagation();
        }}
        onClick={activate}
        onPointerEnter={activate}
        onPointerLeave={(event) => {
          event.stopPropagation();
          onActivate(undefined);
        }}
      >
        {point.kind === 'goal' ? (
          <GoalDisc active={active} opacity={opacity} />
        ) : point.kind === 'fifty' ? (
          <FiftyMarker active={active} opacity={opacity} point={point} />
        ) : point.isScoringTouch ? (
          <mesh renderOrder={4}>
            <octahedronGeometry args={[active ? 150 : 115, 0]} />
            <meshStandardMaterial
              color={litMarkerColor(color, opacity)}
              depthWrite={opacity === 1}
              emissive={active ? color : '#000000'}
              emissiveIntensity={active ? 0.28 : 0}
              opacity={opacity}
              roughness={0.38}
              transparent={opacity < 1}
            />
          </mesh>
        ) : (
          <mesh renderOrder={4}>
            <sphereGeometry args={[active ? 125 : 91.25, 20, 14]} />
            <meshStandardMaterial
              color={litMarkerColor(color, opacity)}
              depthWrite={opacity === 1}
              emissive={active ? color : '#000000'}
              emissiveIntensity={active ? 0.28 : 0}
              opacity={opacity}
              roughness={0.38}
              transparent={opacity < 1}
            />
          </mesh>
        )}
      </group>
      {active && point.kind !== 'goal' && <ActiveGuide point={point} />}
    </group>
  );
}

function Scene({
  profile,
  points,
  cameraState,
  goalLabels,
  orientationYaw,
  activeId,
  emphasizedIds,
  onActivate,
}: BallTouchSceneProps) {
  return (
    <>
      <color attach="background" args={['#0d1726']} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[-5000, 9000, 3500]} intensity={2.2} />
      <Field goalLabels={goalLabels} profile={profile} />
      {points.map((point) => (
        <Marker
          key={point.id}
          profile={profile}
          point={point}
          active={point.id === activeId}
          muted={!!activeId && !emphasizedIds.includes(point.id)}
          onActivate={onActivate}
        />
      ))}
      <CameraRig orientationYaw={orientationYaw} state={cameraState} />
    </>
  );
}

export interface BallTouchSceneProps {
  profile: ArenaProfile;
  points: SpatialEventPoint[];
  cameraState: TouchMapCameraState;
  goalLabels: GoalLabel[];
  orientationYaw: number;
  activeId?: string;
  emphasizedIds: string[];
  onActivate(id?: string): void;
}

export function BallTouchScene(props: BallTouchSceneProps) {
  const goalOrientation = props.goalLabels
    .map((goal) => `${goal.label} ${goal.teamName}`)
    .join(', ');
  return (
    <Canvas
      role="img"
      aria-label={`${props.profile.label} 3D ball touch map${goalOrientation ? `. ${goalOrientation}` : ''}`}
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
