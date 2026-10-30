import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type SceneWeather = {
  windSpeed: number;
  windDirection: number;
  gust: number;
  temperature: number;
  cloudCover: number;
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  precipitation: number;
  layer: 'wind' | 'cloud' | 'temperature' | 'rain';
  scenarioActive: boolean;
  dustLoading: number;
  windLayers: Array<{ label: string; speed: number; direction: number; altitude: number; humidity?: number; cloud?: number; temperature?: number }>;
};

type Props = { weather: SceneWeather };

function createClouds(group: THREE.Group, amount: number, y: number, tint: number) {
  const count = Math.max(2, Math.round((amount / 100) * 12));
  const material = new THREE.MeshBasicMaterial({
    color: tint,
    transparent: true,
    opacity: 0.12 + (amount / 100) * 0.18,
    depthWrite: false,
  });
  for (let i = 0; i < count; i += 1) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(0.48 + Math.random() * 0.28, 10, 8), material);
    cloud.scale.set(1.9 + Math.random() * 1.2, 0.28 + Math.random() * 0.15, 0.8 + Math.random() * 0.5);
    cloud.position.set((Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 6);
    group.add(cloud);
  }
}

export default function WeatherScene({ weather }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050505');
    scene.fog = new THREE.FogExp2('#050505', 0.028);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(11, 10, 16);
    camera.lookAt(0, 1.6, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 9;
    controls.maxDistance = 36;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 1.6, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0xb8abc7, 1.4));
    const key = new THREE.DirectionalLight(0xeadfff, 2.0);
    key.position.set(8, 14, 10);
    scene.add(key);
    const rim = new THREE.PointLight(0x00e5ff, 18, 32);
    rim.position.set(-7, 5, -5);
    scene.add(rim);

    const platform = new THREE.Group();
    scene.add(platform);

    const floorGeometry = new THREE.PlaneGeometry(18, 11, 54, 36);
    floorGeometry.rotateX(-Math.PI / 2);
    const positions = floorGeometry.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const baseColor = new THREE.Color();
    const hotColor = new THREE.Color('#e6a25d');
    const coolColor = new THREE.Color('#460f84');
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const wave = Math.sin(x * 0.45) * Math.cos(z * 0.5) * 0.08;
      const ripple = Math.cos((x + z) * 0.28) * 0.045;
      positions.setY(i, wave + ripple);
      const blend = weather.layer === 'temperature'
        ? THREE.MathUtils.clamp((weather.temperature - 18) / 24, 0, 1)
        : THREE.MathUtils.clamp(weather.windSpeed / 18, 0, 1);
      baseColor.copy(coolColor).lerp(hotColor, blend * 0.64 + (0.08 * Math.sin(x * 0.3 + z * 0.2)));
      colors.push(baseColor.r, baseColor.g, baseColor.b);
    }
    floorGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    floorGeometry.computeVertexNormals();
    const floor = new THREE.Mesh(
      floorGeometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.08, side: THREE.DoubleSide }),
    );
    platform.add(floor);

    const grid = new THREE.GridHelper(18, 36, 0x8c77a5, 0x30174b);
    grid.position.y = 0.08;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.22;
    platform.add(grid);

    // Reference observation points (not a claim of building-scale model resolution).
    const stationPoints = [
      { x: -1.5, z: 0.4, color: 0x00e5ff },
      { x: 1.2, z: -0.3, color: 0xf3bc70 },
    ];
    stationPoints.forEach((point) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.025, 6, 48),
        new THREE.MeshBasicMaterial({ color: point.color, transparent: true, opacity: 0.9 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(point.x, 0.35, point.z);
      platform.add(ring);
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 10),
        new THREE.MeshBasicMaterial({ color: point.color }),
      );
      core.position.set(point.x, 0.38, point.z);
      platform.add(core);
    });

    const atmosphere = new THREE.Group();
    scene.add(atmosphere);
    const cloudGroup = new THREE.Group();
    atmosphere.add(cloudGroup);
    createClouds(cloudGroup, weather.cloudLow, 1.25, 0x00e5ff);
    createClouds(cloudGroup, weather.cloudMid, 3.0, 0x9978be);
    createClouds(cloudGroup, weather.cloudHigh, 4.8, 0xad93cb);
    if (weather.dustLoading > 0) createClouds(cloudGroup, weather.dustLoading, 0.78, 0xc28d55);

    const windLayers = weather.windLayers.length ? weather.windLayers : [
      { label: '10 m', speed: weather.windSpeed, direction: weather.windDirection, altitude: 10 },
      { label: '80 m', speed: weather.windSpeed, direction: weather.windDirection, altitude: 80 },
    ];
    const altitudes = windLayers.map((layer) => Math.max(10, layer.altitude));
    const minAltitude = Math.min(...altitudes);
    const maxAltitude = Math.max(...altitudes);
    const layerYs = altitudes.map((altitude) => 0.45 + ((altitude - minAltitude) / Math.max(1, maxAltitude - minAltitude)) * 4.85);
    const particleCount = 420;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleLayerIndex = new Uint8Array(particleCount);
    const particleVx = new Float32Array(particleCount);
    const particleVz = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i += 1) {
      const layerIndex = i % windLayers.length;
      particleLayerIndex[i] = layerIndex;
      particlePositions[i * 3] = (Math.random() - 0.5) * 17;
      particlePositions[i * 3 + 1] = layerYs[layerIndex] + (Math.random() - 0.5) * 0.28;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 10;
      const layer = windLayers[layerIndex];
      const angle = ((layer.direction + 180) * Math.PI) / 180;
      const speedScale = Math.max(0.05, Math.min(1.5, layer.speed / 8));
      particleVx[i] = Math.sin(angle) * speedScale * 0.055;
      particleVz[i] = -Math.cos(angle) * speedScale * 0.055;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleColor = weather.layer === 'cloud' ? 0x21e8ff : weather.layer === 'temperature' ? 0xffc078 : 0x00e5ff;
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: particleColor, size: 0.055, transparent: true, opacity: 0.82, sizeAttenuation: true }),
    );
    atmosphere.add(particles);

    const rainGroup = new THREE.Group();
    atmosphere.add(rainGroup);
    let rainPosition: THREE.BufferAttribute | null = null;
    if (weather.precipitation > 0.15 || weather.layer === 'rain') {
      const rainVertices: number[] = [];
      for (let i = 0; i < 220; i += 1) {
        const x = (Math.random() - 0.5) * 17;
        const y = 0.4 + Math.random() * 5.2;
        const z = (Math.random() - 0.5) * 10;
        rainVertices.push(x, y, z, x - 0.04, y - 0.33, z - 0.02);
      }
      const rainGeo = new THREE.BufferGeometry();
      rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rainVertices, 3));
      rainPosition = rainGeo.attributes.position as THREE.BufferAttribute;
      const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x16e7ff, transparent: true, opacity: 0.58 }));
      rainGroup.add(rain);
    }

    const atmosphereBox = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-9, 0.15, -5.5), new THREE.Vector3(9, 5.8, 5.5)), 0x3f2062);
    const boxMat = (atmosphereBox as any).material as THREE.Material;
    boxMat.transparent = true;
    boxMat.opacity = 0.14;
    scene.add(atmosphereBox);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(240, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    let last = 0;
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (now - last < 32) return; // ~30 FPS: sufficient for a dashboard and lighter on clients.
      last = now;
      const positionsAttr = particleGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i += 1) {
        const x = positionsAttr.getX(i) + particleVx[i];
        const z = positionsAttr.getZ(i) + particleVz[i];
        positionsAttr.setX(i, x > 9 ? -9 : x < -9 ? 9 : x);
        positionsAttr.setZ(i, z > 5.5 ? -5.5 : z < -5.5 ? 5.5 : z);
      }
      positionsAttr.needsUpdate = true;
      particles.rotation.y = Math.sin(now * 0.00008) * 0.02;
      cloudGroup.position.x = Math.sin(now * 0.00012) * 0.16;
      if (rainPosition) {
        for (let i = 0; i < rainPosition.count; i += 2) {
          let y = rainPosition.getY(i) - 0.13;
          if (y < 0.35) y = 5.6 + Math.random() * 0.8;
          rainPosition.setY(i, y);
          rainPosition.setY(i + 1, y - 0.33);
        }
        rainPosition.needsUpdate = true;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = (mesh as any).material;
        if (material) {
          if (Array.isArray(material)) material.forEach((m: THREE.Material) => m.dispose());
          else material.dispose?.();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [weather.windSpeed, weather.windDirection, weather.gust, weather.temperature,
      weather.cloudCover, weather.cloudLow, weather.cloudMid, weather.cloudHigh,
      weather.precipitation, weather.layer, weather.scenarioActive, weather.dustLoading, JSON.stringify(weather.windLayers)]);

  return <div className="weather-scene" ref={hostRef} aria-label="Three-dimensional atmospheric weather visualization" />;
}
