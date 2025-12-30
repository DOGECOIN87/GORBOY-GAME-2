import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import {
  Banknote,
  Crosshair,
  Landmark,
  Shield,
  Sparkles,
  Timer,
  Skull,
  Wallet,
  Zap,
  Terminal,
  ChevronRight,
  Activity,
  Menu,
  X,
  Navigation,
  RotateCcw
} from "lucide-react";

import { Button, Card, Badge, Progress } from "./components/UI";
import { TokenType, Hud, Character, PowerUp } from "./types";
import { getTacticalBriefing } from "./services/geminiService";

const MotionDiv = motion.div as any;

const MOCK_CHARACTERS: Character[] = [
  { id: "nft-0xA1", name: "Null Pilot", flavor: "silent hull", accent: "0xA1" },
  { id: "nft-0xB7", name: "Gorboy Raider", flavor: "coin hungry", accent: "0xB7" },
  { id: "nft-0xC3", name: "Dock Whisperer", flavor: "fast banking", accent: "0xC3" },
];

const fmt = (n: number) => n.toLocaleString();

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const [walletConnected, setWalletConnected] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState(MOCK_CHARACTERS[0].id);
  const [tacticalLog, setTacticalLog] = useState("Establishing tactical link...");
  const [showCharDialog, setShowCharDialog] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  const selectedCharacter = useMemo(
    () => MOCK_CHARACTERS.find((c) => c.id === selectedCharacterId) ?? MOCK_CHARACTERS[0],
    [selectedCharacterId]
  );

  const [hud, setHud] = useState<Hud>(() => ({
    wave: 1,
    hp: 100,
    shield: 40,
    carried: { COIN: 0, GORBOY: 0, CRYSTAL: 0 },
    banked: { COIN: 0, GORBOY: 0, CRYSTAL: 0 },
    multiplier: 1,
    dockNearby: false,
    dockHold: 0,
    alive: true,
    invulnMs: 0,
    dropsCount: 0,
    info: "WASD = MOVE | SPACE = FIRE | E = DOCK | DOUBLE-TAP A/D = ROLL",
  }));

  const gameRef = useRef({
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: null as THREE.WebGLRenderer | null,
    ship: null as THREE.Group | null,
    shieldMesh: null as THREE.Mesh | null,
    thrusterLightL: null as THREE.PointLight | null,
    thrusterLightR: null as THREE.PointLight | null,
    asteroids: [] as { mesh: THREE.Group; vx: number; vy: number; r: number; hp: number; rotationAxis: THREE.Vector3; rotationSpeed: number }[],
    bullets: [] as { mesh: THREE.Mesh; vx: number; vy: number; life: number }[],
    pickups: [] as { mesh: THREE.Group; vx: number; vy: number; type: TokenType; despawnAt: number }[],
    powerups: [] as { mesh: THREE.Group; vx: number; vy: number; kind: PowerUp["kind"]; despawnAt: number }[],
    dock: null as THREE.Group | null,
    starfield: null as THREE.Points | null,
    particles: [] as { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number }[],
    wave: 1,
    shipState: { 
      x: 0, y: 0, 
      vx: 0, vy: 0, 
      a: 0, va: 0, 
      tilt: 0, 
      hp: 100, shield: 40, 
      alive: true, 
      invulnUntil: 0,
      rollState: { active: false, dir: 0, start: 0, duration: 400 } 
    },
    inputState: {
      lastTap: { key: null as string | null, time: 0 }
    },
    carried: { COIN: 0, GORBOY: 0, CRYSTAL: 0 },
    banked: { COIN: 0, GORBOY: 0, CRYSTAL: 0 },
    keys: {} as Record<string, boolean>,
    touchControls: { thrust: false, left: false, right: false, fire: false, dock: false },
    multiplier: 1,
    multUntil: 0,
    dockHold: 0,
    cameraShake: 0
  });

  const updateTacticalLog = useCallback(async (wave: number, hp: number, charName: string) => {
    const briefing = await getTacticalBriefing(wave, hp, charName);
    setTacticalLog(briefing);
  }, []);

  const createAsteroidGeometry = (radius: number) => {
    const geometry = new THREE.IcosahedronGeometry(radius, 1);
    const position = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      const noise = (Math.random() - 0.5) * (radius * 0.6);
      vertex.multiplyScalar(1 + noise / radius);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    
    geometry.computeVertexNormals();
    return geometry;
  };

  const spawnWave = useCallback((wave: number) => {
    const g = gameRef.current;
    if (!g.scene) return;

    g.asteroids.forEach(a => g.scene?.remove(a.mesh));
    g.asteroids = [];

    const count = 6 + wave * 4;
    
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const r = 2.5 + Math.random() * 5;
      
      const geometry = createAsteroidGeometry(r);
      const material = new THREE.MeshStandardMaterial({ 
        color: 0x1e293b, 
        flatShading: true,
        roughness: 0.8,
        metalness: 0.2
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);

      // Deep Craters
      for (let j = 0; j < 3; j++) {
        const craterSize = r * 0.35;
        const craterGeom = new THREE.CylinderGeometry(craterSize, craterSize * 0.4, 0.4, 7);
        const craterMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, flatShading: true, roughness: 1 });
        const crater = new THREE.Mesh(craterGeom, craterMat);
        
        // Random position on surface
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const x = r * 0.9 * Math.sin(phi) * Math.cos(theta);
        const y = r * 0.9 * Math.sin(phi) * Math.sin(theta);
        const z = r * 0.9 * Math.cos(phi);
        
        crater.position.set(x, y, z);
        crater.lookAt(0,0,0);
        group.add(crater);
      }

      // Glowing Crystals (Emissive details)
      const crystalCount = 2 + Math.floor(Math.random() * 4);
      const crystalGeom = new THREE.ConeGeometry(r * 0.1, r * 0.5, 4);
      const crystalMat = new THREE.MeshStandardMaterial({
        color: 0x06b6d4, // Cyan
        emissive: 0x06b6d4,
        emissiveIntensity: 1.5,
        roughness: 0.2
      });
      
      for(let k=0; k<crystalCount; k++) {
         const crystal = new THREE.Mesh(crystalGeom, crystalMat);
         
         const theta = Math.random() * Math.PI * 2;
         const phi = Math.random() * Math.PI;
         const x = r * 0.85 * Math.sin(phi) * Math.cos(theta);
         const y = r * 0.85 * Math.sin(phi) * Math.sin(theta);
         const z = r * 0.85 * Math.cos(phi);
         
         crystal.position.set(x, y, z);
         crystal.lookAt(0,0,0); 
         crystal.rotateX(Math.PI); 
         // Random tilt
         crystal.rotateX((Math.random()-0.5)*0.8);
         crystal.rotateZ((Math.random()-0.5)*0.8);
         group.add(crystal);
      }

      const wireframe = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.08 })
      );
      group.add(wireframe);
      
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 60;
      group.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      
      g.scene.add(group);
      g.asteroids.push({
        mesh: group,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        r,
        hp: r * 25,
        rotationAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
        rotationSpeed: (Math.random() - 0.5) * 0.03
      });
    }

    g.wave = wave;
    updateTacticalLog(wave, g.shipState.hp, selectedCharacter.name);
  }, [selectedCharacter.name, updateTacticalLog]);

  const initThree = useCallback(() => {
    if (!containerRef.current) return;
    const g = gameRef.current;
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    scene.fog = new THREE.FogExp2(0x020617, 0.005);
    g.scene = scene;

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 70, 40);
    g.camera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);
    g.renderer = renderer;

    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 2);
    mainLight.position.set(20, 50, 20);
    scene.add(mainLight);

    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 4000;
    const posArray = new Float32Array(starsCount * 3);
    const colorArray = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount; i++) {
      posArray[i * 3] = (Math.random() - 0.5) * 800;
      posArray[i * 3 + 1] = (Math.random() - 0.5) * 400;
      posArray[i * 3 + 2] = (Math.random() - 0.5) * 800;
      
      const r = 0.5 + Math.random() * 0.5;
      colorArray[i * 3] = r;
      colorArray[i * 3 + 1] = r * (0.8 + Math.random() * 0.2);
      colorArray[i * 3 + 2] = 1.0;
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    starsGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    const starsMaterial = new THREE.PointsMaterial({ size: 0.6, vertexColors: true, transparent: true, opacity: 0.8 });
    g.starfield = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(g.starfield);

    // --- GORBOY II SHIP MODEL ---
    const shipGroup = new THREE.Group();

    // Materials
    const hullMat = new THREE.MeshStandardMaterial({ 
        color: 0xe2e8f0, // Silver
        metalness: 0.6, 
        roughness: 0.25 
    });
    const darkMat = new THREE.MeshStandardMaterial({ 
        color: 0x1e293b, // Dark slate
        metalness: 0.5, 
        roughness: 0.5 
    });
    const emissiveBlue = new THREE.MeshStandardMaterial({ 
        color: 0x06b6d4, // Cyan
        emissive: 0x06b6d4, 
        emissiveIntensity: 2.0,
        toneMapped: false
    });
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const holographMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    // 1. Main Chassis (GameBoy Body)
    // Oriented: Bottom of GB is Back (-Z), Top of GB is Front (+Z)
    const chassisGeom = new THREE.BoxGeometry(3.2, 0.8, 5.0);
    const chassis = new THREE.Mesh(chassisGeom, hullMat);
    shipGroup.add(chassis);

    // 2. Side Pods (Plasma Thruster Arrays)
    const podGeom = new THREE.CylinderGeometry(0.8, 1.0, 3.5, 4); 
    const podL = new THREE.Mesh(podGeom, darkMat);
    podL.rotation.x = Math.PI / 2; 
    podL.rotation.y = Math.PI / 4; 
    podL.position.set(-2.2, 0, 0.5); 
    shipGroup.add(podL);

    const podR = podL.clone();
    podR.position.set(2.2, 0, 0.5);
    shipGroup.add(podR);

    // Connecting struts
    const strutGeom = new THREE.BoxGeometry(1.2, 0.4, 2.0);
    const strutL = new THREE.Mesh(strutGeom, hullMat);
    strutL.position.set(-1.6, 0, 0.5);
    shipGroup.add(strutL);
    const strutR = strutL.clone();
    strutR.position.set(1.6, 0, 0.5);
    shipGroup.add(strutR);

    // 3. Rear Main Thrusters (A/B Units) - Located at -Z end
    const engineGeom = new THREE.CylinderGeometry(0.5, 0.7, 1.0, 16);
    const engineL = new THREE.Mesh(engineGeom, darkMat);
    engineL.rotation.x = Math.PI / 2;
    engineL.position.set(-0.8, 0, -2.8); // Back
    shipGroup.add(engineL);

    const engineR = engineL.clone();
    engineR.position.set(0.8, 0, -2.8); // Back
    shipGroup.add(engineR);

    // Emissive Cores
    const coreGeom = new THREE.CylinderGeometry(0.35, 0.1, 0.2, 16);
    const coreL = new THREE.Mesh(coreGeom, emissiveBlue);
    coreL.rotation.x = -Math.PI / 2; // Point out back
    coreL.position.set(0, 0.5, 0); 
    engineL.add(coreL);
    const coreR = coreL.clone();
    engineR.add(coreR);

    // 4. Front Details (Cart Slot Area) at +Z
    const bumperGeom = new THREE.BoxGeometry(3.2, 0.9, 0.5);
    const bumper = new THREE.Mesh(bumperGeom, darkMat);
    bumper.position.set(0, 0, 2.5);
    shipGroup.add(bumper);

    // 5. Top Surface Details
    // Screen Housing
    const bezelGeom = new THREE.BoxGeometry(2.8, 0.2, 2.4);
    const bezel = new THREE.Mesh(bezelGeom, hullMat);
    bezel.position.set(0, 0.5, -0.5); 
    shipGroup.add(bezel);

    // Screen
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.0), screenMat);
    screenMesh.rotation.x = -Math.PI / 2;
    screenMesh.position.set(0, 0.61, -0.5);
    shipGroup.add(screenMesh);

    // Holographic HUD
    const holoMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.0), holographMat);
    holoMesh.rotation.x = -Math.PI / 2;
    holoMesh.position.set(0, 0.8, -0.5);
    shipGroup.add(holoMesh);

    // D-Pad (Left side)
    const dpadGroup = new THREE.Group();
    const dpadV = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.75), emissiveBlue);
    const dpadH = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.15, 0.25), emissiveBlue);
    dpadGroup.add(dpadV, dpadH);
    dpadGroup.position.set(-1.0, 0.5, 1.5);
    shipGroup.add(dpadGroup);

    // Buttons (Right side)
    const btnGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16);
    const btnA = new THREE.Mesh(btnGeom, emissiveBlue);
    btnA.position.set(1.0, 0.5, 1.3);
    shipGroup.add(btnA);
    const btnB = new THREE.Mesh(btnGeom, emissiveBlue);
    btnB.position.set(0.6, 0.5, 1.6);
    shipGroup.add(btnB);

    // Speaker Grills (Front Right)
    const speakerGeom = new THREE.BoxGeometry(0.1, 0.05, 0.6);
    for(let i=0; i<3; i++) {
        const s = new THREE.Mesh(speakerGeom, darkMat);
        s.position.set(1.0 + i*0.2, 0.45, -1.8);
        s.rotation.y = -0.5;
        shipGroup.add(s);
    }

    // Shield
    const shieldGeom = new THREE.IcosahedronGeometry(4.0, 2);
    const shieldMat = new THREE.MeshBasicMaterial({ 
        color: 0x06b6d4, 
        transparent: true, 
        opacity: 0,
        wireframe: true 
    });
    const shieldMesh = new THREE.Mesh(shieldGeom, shieldMat);
    shipGroup.add(shieldMesh);
    g.shieldMesh = shieldMesh;

    // Thruster Lights
    const tLightL = new THREE.PointLight(0x06b6d4, 0, 10);
    tLightL.position.set(-0.8, 0, -4);
    shipGroup.add(tLightL);
    g.thrusterLightL = tLightL;
    const tLightR = new THREE.PointLight(0x06b6d4, 0, 10);
    tLightR.position.set(0.8, 0, -4);
    shipGroup.add(tLightR);
    g.thrusterLightR = tLightR;

    scene.add(shipGroup);
    g.ship = shipGroup;

    // Dock
    const dock = new THREE.Group();
    const torusGeom = new THREE.TorusGeometry(10, 0.5, 16, 100);
    const torusMat = new THREE.MeshStandardMaterial({ 
        color: 0x3b82f6, 
        emissive: 0x3b82f6, 
        emissiveIntensity: 1, 
        transparent: true, 
        opacity: 0.6 
    });
    const mainRing = new THREE.Mesh(torusGeom, torusMat);
    mainRing.rotation.x = Math.PI / 2;
    dock.add(mainRing);
    
    const spokeGeom = new THREE.BoxGeometry(1, 0.5, 10);
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.1 });
    for(let i=0; i<4; i++) {
        const spoke = new THREE.Mesh(spokeGeom, accentMat);
        spoke.rotation.y = (i * Math.PI) / 2;
        dock.add(spoke);
    }
    
    dock.position.set(50, 0, 50);
    scene.add(dock);
    g.dock = dock;

    spawnWave(1);

    const handleResize = () => {
      if (!containerRef.current || !g.camera || !g.renderer) return;
      g.camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      g.camera.updateProjectionMatrix();
      g.renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [spawnWave]);

  useEffect(() => {
    const cleanup = initThree();
    const g = gameRef.current;

    let lastTime = performance.now();
    let lastShot = 0;

    const gameLoop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      const now = Date.now();

      if (g.shipState.alive && g.ship && g.camera && g.scene) {
        const angularAccel = 8.0; 
        const angularDrag = 3.0;
        const linearAccel = 95; 
        const linearDrag = 0.995; 
        
        let turning = 0;
        if (g.keys['KeyA'] || g.keys['ArrowLeft'] || g.touchControls.left) turning += 1;
        if (g.keys['KeyD'] || g.keys['ArrowRight'] || g.touchControls.right) turning -= 1;
        
        g.shipState.va += turning * angularAccel * dt;
        g.shipState.va -= g.shipState.va * angularDrag * dt;
        g.shipState.a += g.shipState.va * dt;

        if (g.shipState.rollState.active) {
            const elapsed = now - g.shipState.rollState.start;
            const progress = Math.min(1, elapsed / g.shipState.rollState.duration);
            const ease = 1 - Math.pow(1 - progress, 3);
            const fullRot = Math.PI * 2 * g.shipState.rollState.dir;
            g.shipState.tilt = fullRot * ease;
            
            if (progress >= 1) {
                g.shipState.rollState.active = false;
                g.shipState.tilt = 0;
            }
            g.shipState.invulnUntil = Math.max(g.shipState.invulnUntil, now + 100);
            
            if (Math.random() > 0.5) {
                const pGeom = new THREE.BoxGeometry(0.1, 0.1, 0.8);
                const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
                const p = new THREE.Mesh(pGeom, pMat);
                p.position.copy(g.ship.position).add(new THREE.Vector3((Math.random()-0.5)*2, (Math.random()-0.5)*1, (Math.random()-0.5)*2));
                g.scene.add(p);
                g.particles.push({
                    mesh: p,
                    velocity: new THREE.Vector3(0, 0, 0),
                    life: 0.3,
                    maxLife: 0.3
                });
            }
        } else {
            const targetTilt = THREE.MathUtils.clamp(g.shipState.va * 0.15, -0.6, 0.6);
            g.shipState.tilt = THREE.MathUtils.lerp(g.shipState.tilt, targetTilt, 0.1);
        }

        const thrusting = g.keys['KeyW'] || g.keys['ArrowUp'] || g.touchControls.thrust;
        if (thrusting) {
          g.shipState.vx += Math.sin(g.shipState.a) * linearAccel * dt;
          g.shipState.vy += Math.cos(g.shipState.a) * linearAccel * dt;
          
          if (Math.random() > 0.4) {
            const spawnParticle = (offsetX: number) => {
                const pGeom = new THREE.SphereGeometry(0.2);
                const pMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.8 });
                const p = new THREE.Mesh(pGeom, pMat);
                // Engine is at -Z relative to ship
                const pPos = new THREE.Vector3(offsetX, 0, -3.5);
                pPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), g.shipState.a);
                p.position.copy(g.ship!.position).add(pPos);

                g.scene!.add(p);
                g.particles.push({
                  mesh: p,
                  velocity: new THREE.Vector3(-Math.sin(g.shipState.a) * 5, (Math.random() - 0.5) * 2, -Math.cos(g.shipState.a) * 5),
                  life: 0.5,
                  maxLife: 0.5
                });
            };
            spawnParticle(-0.8);
            spawnParticle(0.8);
          }
        }
        
        const intensity = thrusting ? 5 + Math.random() * 5 : 0;
        if (g.thrusterLightL) g.thrusterLightL.intensity = intensity;
        if (g.thrusterLightR) g.thrusterLightR.intensity = intensity;

        if (g.shieldMesh) {
            const invulnTime = g.shipState.invulnUntil - now;
            if (invulnTime > 0) {
                (g.shieldMesh.material as THREE.MeshBasicMaterial).opacity = (invulnTime / 1500) * 0.5 + Math.sin(time * 20) * 0.1;
                g.shieldMesh.rotateY(0.1);
            } else {
                (g.shieldMesh.material as THREE.MeshBasicMaterial).opacity = 0;
            }
        }

        if (g.keys['KeyS'] || g.keys['ArrowDown']) {
          g.shipState.vx *= 0.95;
          g.shipState.vy *= 0.95;
        }

        g.shipState.vx *= linearDrag;
        g.shipState.vy *= linearDrag;

        g.shipState.x += g.shipState.vx * dt;
        g.shipState.y += g.shipState.vy * dt;

        const bounds = 120;
        if (g.shipState.x > bounds) g.shipState.x = -bounds;
        if (g.shipState.x < -bounds) g.shipState.x = bounds;
        if (g.shipState.y > bounds) g.shipState.y = -bounds;
        if (g.shipState.y < -bounds) g.shipState.y = bounds;

        g.ship.position.set(g.shipState.x, 0, g.shipState.y);
        g.ship.rotation.y = g.shipState.a;
        g.ship.rotation.z = g.shipState.tilt; 

        const camTargetPos = new THREE.Vector3(
          g.shipState.x - Math.sin(g.shipState.a) * 22, 
          40, 
          g.shipState.y - Math.cos(g.shipState.a) * 22
        );
        g.camera.position.lerp(camTargetPos, 0.05); 
        
        if (g.cameraShake > 0) {
          g.camera.position.x += (Math.random() - 0.5) * g.cameraShake;
          g.camera.position.y += (Math.random() - 0.5) * g.cameraShake;
          g.cameraShake *= 0.9;
        }
        
        g.camera.lookAt(g.shipState.x, 0, g.shipState.y);

        if ((g.keys['Space'] || g.touchControls.fire) && now - lastShot > 150) {
          lastShot = now;
          const bGeom = new THREE.CylinderGeometry(0.15, 0.15, 1.2, 4);
          const bMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
          const bMesh = new THREE.Mesh(bGeom, bMat);
          bMesh.position.copy(g.ship.position);
          bMesh.rotation.copy(g.ship.rotation);
          bMesh.rotation.x = Math.PI / 2;
          g.scene.add(bMesh);
          g.bullets.push({
            mesh: bMesh,
            vx: g.shipState.vx + Math.sin(g.shipState.a) * 150,
            vy: g.shipState.vy + Math.cos(g.shipState.a) * 150,
            life: 1.2
          });
        }

        if (g.dock) {
          const inDock = g.ship.position.distanceTo(g.dock.position) < 12;
          g.dock.rotation.y += 0.01;
          if (inDock && (g.keys['KeyE'] || g.touchControls.dock)) {
            g.dockHold = Math.min(100, g.dockHold + dt * 100);
            if (g.dockHold >= 100) {
              g.banked.COIN += g.carried.COIN;
              g.banked.GORBOY += g.carried.GORBOY;
              g.banked.CRYSTAL += g.carried.CRYSTAL;
              g.carried = { COIN: 0, GORBOY: 0, CRYSTAL: 0 };
              g.dockHold = 0;
            }
          } else {
            g.dockHold = Math.max(0, g.dockHold - dt * 250);
          }
        }
      }

      for (let i = g.particles.length - 1; i >= 0; i--) {
        const p = g.particles[i];
        p.life -= dt;
        p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
        const scale = p.life / p.maxLife;
        p.mesh.scale.set(scale, scale, scale);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = scale;
        if (p.life <= 0) {
          g.scene?.remove(p.mesh);
          g.particles.splice(i, 1);
        }
      }

      for (let i = g.bullets.length - 1; i >= 0; i--) {
        const b = g.bullets[i];
        b.life -= dt;
        b.mesh.position.x += b.vx * dt;
        b.mesh.position.z += b.vy * dt;
        if (b.life <= 0) {
          g.scene?.remove(b.mesh);
          g.bullets.splice(i, 1);
        }
      }

      for (let i = g.asteroids.length - 1; i >= 0; i--) {
        const a = g.asteroids[i];
        a.mesh.position.x += a.vx * dt;
        a.mesh.position.z += a.vy * dt;
        a.mesh.rotateOnAxis(a.rotationAxis, a.rotationSpeed);

        const bounds = 150;
        if (a.mesh.position.x > bounds) a.mesh.position.x = -bounds;
        if (a.mesh.position.x < -bounds) a.mesh.position.x = bounds;
        if (a.mesh.position.z > bounds) a.mesh.position.z = -bounds;
        if (a.mesh.position.z < -bounds) a.mesh.position.z = bounds;

        for (let j = g.bullets.length - 1; j >= 0; j--) {
          const b = g.bullets[j];
          if (a.mesh.position.distanceTo(b.mesh.position) < a.r) {
            a.hp -= 40;
            g.scene?.remove(b.mesh);
            g.bullets.splice(j, 1);
            g.cameraShake = 0.5;
            
            if (a.hp <= 0) {
              for (let k = 0; k < 12; k++) {
                const fSize = 0.2 + Math.random() * 0.4;
                const fGeom = new THREE.IcosahedronGeometry(fSize, 0);
                const fMat = new THREE.MeshBasicMaterial({ color: 0x475569 });
                const f = new THREE.Mesh(fGeom, fMat);
                f.position.copy(a.mesh.position);
                g.scene?.add(f);
                g.particles.push({
                  mesh: f,
                  velocity: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
                  life: 1.0,
                  maxLife: 1.0
                });
              }

              // Token spawning: 65% COIN, 25% GORBOY, 10% CRYSTAL
              const roll = Math.random();
              const type: TokenType = roll < 0.65 ? "COIN" : roll < 0.90 ? "GORBOY" : "CRYSTAL";
              const pGroup = new THREE.Group();

              if (type === "CRYSTAL") {
                  // Crystal pickup - a glowing cyan gem
                  const crystalGeom = new THREE.OctahedronGeometry(0.6, 0);
                  const crystalMat = new THREE.MeshStandardMaterial({
                    color: 0x06b6d4,
                    emissive: 0x06b6d4,
                    emissiveIntensity: 2,
                    transparent: true,
                    opacity: 0.9
                  });
                  const crystal = new THREE.Mesh(crystalGeom, crystalMat);
                  pGroup.add(crystal);

                  // Inner glow
                  const innerGlow = new THREE.Mesh(
                    new THREE.OctahedronGeometry(0.4, 0),
                    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
                  );
                  pGroup.add(innerGlow);
              } else if (type === "COIN") {
                  const cGroup = new THREE.Group();
                  
                  const rim = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.7, 0.7, 0.1, 32),
                    new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1, roughness: 0.3 })
                  );
                  rim.rotation.x = Math.PI/2;
                  cGroup.add(rim);

                  const face = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.5, 0.5, 0.11, 32),
                    new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.5 })
                  );
                  face.rotation.x = Math.PI/2;
                  cGroup.add(face);
                  
                  const symbol = new THREE.Mesh(
                    new THREE.BoxGeometry(0.2, 0.6, 0.2),
                    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 })
                  );
                  cGroup.add(symbol);

                  pGroup.add(cGroup);
              } else {
                  const cartBody = new THREE.Mesh(
                    new THREE.BoxGeometry(0.8, 1.1, 0.2),
                    new THREE.MeshStandardMaterial({ color: 0x475569 })
                  );
                  pGroup.add(cartBody);
                  
                  const label = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.6, 0.7),
                    new THREE.MeshStandardMaterial({ color: 0xdb2777, emissive: 0xdb2777, emissiveIntensity: 1.5, side: THREE.DoubleSide })
                  );
                  label.position.z = 0.11;
                  pGroup.add(label);
                  
                  const pins = new THREE.Mesh(
                    new THREE.BoxGeometry(0.6, 0.1, 0.22),
                    new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1 })
                  );
                  pins.position.y = -0.6;
                  pGroup.add(pins);
              }

              const ringColor = type === "COIN" ? 0xfbbf24 : type === "GORBOY" ? 0xf472b6 : 0x06b6d4;
              const pRing = new THREE.Mesh(
                 new THREE.TorusGeometry(1.3, 0.08, 8, 32), 
                 new THREE.MeshBasicMaterial({ color: ringColor }) 
              );
              const glowRing = new THREE.Mesh(
                 new THREE.TorusGeometry(1.5, 0.2, 8, 32),
                 new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.2 })
              );

              pRing.rotation.x = Math.PI / 2;
              glowRing.rotation.x = Math.PI / 2;
              pGroup.add(pRing);
              pGroup.add(glowRing);
              
              pGroup.position.copy(a.mesh.position);
              g.scene?.add(pGroup);
              g.pickups.push({
                mesh: pGroup,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                type: type as TokenType,
                despawnAt: now + 12000
              });

              // 15% chance to spawn a power-up from larger asteroids
              if (a.r > 4 && Math.random() < 0.15) {
                const powerupGroup = new THREE.Group();
                const kinds: PowerUp["kind"][] = ["X2", "X4", "SHIELD"];
                const kind = kinds[Math.floor(Math.random() * kinds.length)];

                if (kind === "X2" || kind === "X4") {
                  // Multiplier power-up - glowing cube with number
                  const cubeGeom = new THREE.BoxGeometry(1.2, 1.2, 1.2);
                  const cubeMat = new THREE.MeshStandardMaterial({
                    color: kind === "X2" ? 0x22c55e : 0xeab308, // Green for X2, Yellow for X4
                    emissive: kind === "X2" ? 0x22c55e : 0xeab308,
                    emissiveIntensity: 1.5,
                    transparent: true,
                    opacity: 0.8
                  });
                  const cube = new THREE.Mesh(cubeGeom, cubeMat);
                  powerupGroup.add(cube);

                  // Wireframe overlay
                  const wireframe = new THREE.LineSegments(
                    new THREE.EdgesGeometry(cubeGeom),
                    new THREE.LineBasicMaterial({ color: 0xffffff })
                  );
                  powerupGroup.add(wireframe);

                  // Inner glow sphere
                  const innerGlow = new THREE.Mesh(
                    new THREE.SphereGeometry(0.4, 8, 8),
                    new THREE.MeshBasicMaterial({ color: 0xffffff })
                  );
                  powerupGroup.add(innerGlow);
                } else {
                  // Shield power-up - glowing blue hexagon
                  const shieldGeom = new THREE.IcosahedronGeometry(0.8, 0);
                  const shieldMat = new THREE.MeshStandardMaterial({
                    color: 0x3b82f6,
                    emissive: 0x3b82f6,
                    emissiveIntensity: 2,
                    transparent: true,
                    opacity: 0.8
                  });
                  const shield = new THREE.Mesh(shieldGeom, shieldMat);
                  powerupGroup.add(shield);

                  // Outer ring
                  const ring = new THREE.Mesh(
                    new THREE.TorusGeometry(1.2, 0.1, 8, 32),
                    new THREE.MeshBasicMaterial({ color: 0x60a5fa })
                  );
                  ring.rotation.x = Math.PI / 2;
                  powerupGroup.add(ring);
                }

                // Add outer glow ring to all power-ups
                const glowRing = new THREE.Mesh(
                  new THREE.TorusGeometry(1.5, 0.15, 8, 32),
                  new THREE.MeshBasicMaterial({
                    color: kind === "SHIELD" ? 0x3b82f6 : kind === "X2" ? 0x22c55e : 0xeab308,
                    transparent: true,
                    opacity: 0.3
                  })
                );
                glowRing.rotation.x = Math.PI / 2;
                powerupGroup.add(glowRing);

                // Offset slightly from pickup
                powerupGroup.position.copy(a.mesh.position);
                powerupGroup.position.x += (Math.random() - 0.5) * 5;
                powerupGroup.position.z += (Math.random() - 0.5) * 5;
                g.scene?.add(powerupGroup);
                g.powerups.push({
                  mesh: powerupGroup,
                  vx: (Math.random() - 0.5) * 6,
                  vy: (Math.random() - 0.5) * 6,
                  kind,
                  despawnAt: now + 10000
                });
              }

              g.scene?.remove(a.mesh);
              g.asteroids.splice(i, 1);
              break;
            }
          }
        }

        if (g.shipState.alive && now > g.shipState.invulnUntil) {
          if (a.mesh.position.distanceTo(g.ship.position) < a.r + 2.5) {
            g.shipState.shield -= 25;
            g.cameraShake = 2.0;
            if (g.shipState.shield < 0) {
              g.shipState.hp += g.shipState.shield;
              g.shipState.shield = 0;
            }
            if (g.shipState.hp <= 0) g.shipState.alive = false;
            g.shipState.invulnUntil = now + 1500;
            const pushDir = g.ship.position.clone().sub(a.mesh.position).normalize();
            g.shipState.vx += pushDir.x * 50;
            g.shipState.vy += pushDir.z * 50;
          }
        }
      }

      for (let i = g.pickups.length - 1; i >= 0; i--) {
        const p = g.pickups[i];
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.z += p.vy * dt;
        p.mesh.rotation.y += 0.04;
        p.mesh.position.y = Math.sin(time * 0.005) * 0.5;

        if (p.mesh.position.distanceTo(g.ship.position) < 5 && g.shipState.alive) {
          g.carried[p.type] += g.multiplier;
          g.scene?.remove(p.mesh);
          g.pickups.splice(i, 1);
          continue;
        }
        if (now > p.despawnAt) {
          g.scene?.remove(p.mesh);
          g.pickups.splice(i, 1);
        }
      }

      // Power-up update and collection loop
      for (let i = g.powerups.length - 1; i >= 0; i--) {
        const pu = g.powerups[i];
        pu.mesh.position.x += pu.vx * dt;
        pu.mesh.position.z += pu.vy * dt;
        pu.mesh.rotation.y += 0.06;
        pu.mesh.rotation.x += 0.02;
        pu.mesh.position.y = Math.sin(time * 0.008) * 0.8 + 1;

        // Pulsating scale effect
        const pulse = 1 + Math.sin(time * 0.01) * 0.1;
        pu.mesh.scale.set(pulse, pulse, pulse);

        // Collection check
        if (pu.mesh.position.distanceTo(g.ship.position) < 4 && g.shipState.alive) {
          // Apply power-up effect
          if (pu.kind === "X2") {
            g.multiplier = 2;
            g.multUntil = now + 8000; // 8 seconds
          } else if (pu.kind === "X4") {
            g.multiplier = 4;
            g.multUntil = now + 6000; // 6 seconds
          } else if (pu.kind === "SHIELD") {
            g.shipState.shield = Math.min(100, g.shipState.shield + 50);
            g.shipState.invulnUntil = Math.max(g.shipState.invulnUntil, now + 2000);
          }

          // Collection particle effect
          for (let k = 0; k < 8; k++) {
            const pGeom = new THREE.SphereGeometry(0.3);
            const pMat = new THREE.MeshBasicMaterial({
              color: pu.kind === "SHIELD" ? 0x3b82f6 : pu.kind === "X2" ? 0x22c55e : 0xeab308,
              transparent: true,
              opacity: 0.8
            });
            const particle = new THREE.Mesh(pGeom, pMat);
            particle.position.copy(pu.mesh.position);
            g.scene?.add(particle);
            g.particles.push({
              mesh: particle,
              velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 15,
                (Math.random() - 0.5) * 15,
                (Math.random() - 0.5) * 15
              ),
              life: 0.6,
              maxLife: 0.6
            });
          }

          g.scene?.remove(pu.mesh);
          g.powerups.splice(i, 1);
          continue;
        }

        // Despawn check
        if (now > pu.despawnAt) {
          g.scene?.remove(pu.mesh);
          g.powerups.splice(i, 1);
        }
      }

      // Multiplier timer expiration
      if (g.multUntil > 0 && now > g.multUntil) {
        g.multiplier = 1;
        g.multUntil = 0;
      }

      if (g.asteroids.length === 0 && g.shipState.alive) spawnWave(g.wave + 1);

      g.renderer?.render(g.scene!, g.camera!);
      
      setHud({
        wave: g.wave,
        hp: Math.max(0, Math.floor(g.shipState.hp)),
        shield: Math.max(0, Math.floor(g.shipState.shield)),
        carried: { ...g.carried },
        banked: { ...g.banked },
        multiplier: g.multiplier,
        dockNearby: g.dock ? g.ship?.position.distanceTo(g.dock.position) < 12 : false,
        dockHold: g.dockHold,
        alive: g.shipState.alive,
        invulnMs: Math.max(0, g.shipState.invulnUntil - now),
        dropsCount: g.pickups.length,
        info: g.shipState.alive ? "READY PILOT. SECURE THE CARGO." : "CRITICAL FAILURE. REBOOT REQUIRED."
      });

      rafRef.current = requestAnimationFrame(gameLoop);
    };

    const handleKeyDown = (e: KeyboardEvent) => { 
      g.keys[e.code] = true; 
      
      const now = Date.now();
      if (['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'].includes(e.code)) {
        const isLeft = e.code === 'KeyA' || e.code === 'ArrowLeft';
        if (g.inputState.lastTap.key === e.code && now - g.inputState.lastTap.time < 300) {
           if (!g.shipState.rollState.active && g.shipState.alive) {
              g.shipState.rollState = { active: true, dir: isLeft ? 1 : -1, start: now, duration: 400 };
              
              const boost = 45;
              const angle = g.shipState.a + (isLeft ? Math.PI / 2 : -Math.PI / 2);
              g.shipState.vx += Math.sin(angle) * boost;
              g.shipState.vy += Math.cos(angle) * boost;
              
              g.shipState.vx += Math.sin(g.shipState.a) * 20;
              g.shipState.vy += Math.cos(g.shipState.a) * 20;
           }
        }
        g.inputState.lastTap = { key: e.code, time: now };
      }

      if (e.code === 'KeyR' && !g.shipState.alive) {
        g.shipState = {
            x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, tilt: 0,
            hp: 100, shield: 40, alive: true, invulnUntil: Date.now() + 2000,
            rollState: { active: false, dir: 0, start: 0, duration: 400 }
        };
        g.carried = { COIN: 0, GORBOY: 0, CRYSTAL: 0 };
        g.multiplier = 1;
        g.multUntil = 0;
        // Clear existing power-ups
        g.powerups.forEach(pu => g.scene?.remove(pu.mesh));
        g.powerups = [];
        spawnWave(1);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => { g.keys[e.code] = false; };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (cleanup) cleanup();
    };
  }, [initThree, spawnWave]);

  const setTouchInput = (key: keyof typeof gameRef.current.touchControls, val: boolean) => {
    gameRef.current.touchControls[key] = val;
  };

  return (
    <div className="fixed inset-0 flex flex-col p-4 md:p-6 bg-[#020617] text-slate-200 overflow-hidden touch-none select-none">
      <AnimatePresence>
        {showSidebar && (
          <MotionDiv 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSidebar(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[45] lg:hidden"
          />
        )}
      </AnimatePresence>

      <header className="flex justify-between items-center gap-4 z-10 mb-4 h-12">
        <div className="flex flex-col">
          <h1 className="text-xl md:text-3xl font-black tracking-tighter text-blue-500 flex items-center gap-3">
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.4)]">
              <Zap className="fill-white text-white w-4 h-4 md:w-6 md:h-6" />
            </div>
            <span className="hidden xs:inline uppercase italic">GORBOY II</span>
            <span className="xs:hidden">G-II</span>
          </h1>
          <p className="text-slate-500 text-[9px] font-mono uppercase tracking-widest leading-none mt-1">
             RETRO_FUTURES_LAB // V3.0
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 px-2 md:px-4 text-[10px] bg-slate-900/50 backdrop-blur-md border-blue-500/20 text-blue-400">
            SEC-{hud.wave}
          </Badge>
          <Button variant="outline" className="h-8 w-8 p-0 border-slate-700 bg-slate-900/40 lg:hidden" onClick={() => setShowSidebar(!showSidebar)}>
            {showSidebar ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
          <div className="hidden lg:flex items-center gap-4">
             <Button variant="outline" className="h-10 text-xs" onClick={() => setWalletConnected(!walletConnected)}>
               <Wallet className="w-4 h-4" />
               {walletConnected ? "CONNECTED" : "LINK WALLET"}
             </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex gap-4 md:gap-8 relative">
        <aside className={`
          fixed lg:relative inset-y-0 left-0 w-72 lg:w-72 z-50 lg:z-10 h-full
          transform transition-transform duration-300 ease-in-out bg-slate-950 lg:bg-transparent
          ${showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col gap-4 p-6 lg:p-0 lg:border-none shadow-2xl lg:shadow-none
        `}>
          <div className="flex justify-between items-center lg:hidden mb-4">
             <h2 className="text-xl font-black text-blue-500 tracking-tighter italic">TACTICAL_TERMINAL</h2>
             <Button variant="outline" className="p-1 border-none" onClick={() => setShowSidebar(false)}><X className="w-6 h-6 text-slate-500"/></Button>
          </div>

          <Card className="p-4 flex flex-col gap-4 bg-slate-950/80 border-slate-800">
            <div className="flex justify-between items-center">
              <h2 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-3 h-3" /> Pilot Registry
              </h2>
            </div>
            
            <button 
              onClick={() => { setShowCharDialog(true); setShowSidebar(false); }}
              className="group w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/30 hover:bg-slate-800/50 transition-all flex justify-between items-center relative overflow-hidden"
            >
              <div className="z-10">
                <div className="text-sm font-bold text-slate-100 group-hover:text-blue-400 transition-colors">{selectedCharacter.name}</div>
                <div className="text-[9px] text-slate-500 uppercase font-mono tracking-tighter italic">{selectedCharacter.flavor}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:translate-x-1 transition-transform z-10" />
            </button>

            <div className="p-3 bg-blue-500/5 rounded-xl border border-blue-500/10 backdrop-blur-sm">
              <div className="text-[9px] text-blue-500 uppercase font-black mb-1 flex items-center gap-2 tracking-widest">
                Mission Intelligence
              </div>
              <div className="text-[11px] italic text-slate-300 font-mono leading-relaxed">
                "{tacticalLog}"
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-slate-950/80 border-slate-800">
            <h2 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Asset Vault</h2>
            <div className="flex flex-col gap-2">
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/50 flex justify-between items-center">
                <div className="text-[9px] text-slate-500 font-bold uppercase">SECURED_COIN</div>
                <div className="text-lg font-black text-amber-400 font-mono tracking-tighter">{fmt(hud.banked.COIN)}</div>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/50 flex justify-between items-center">
                <div className="text-[9px] text-slate-500 font-bold uppercase">RESERVE_GBOY</div>
                <div className="text-lg font-black text-pink-400 font-mono tracking-tighter">{fmt(hud.banked.GORBOY)}</div>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/50 flex justify-between items-center">
                <div className="text-[9px] text-slate-500 font-bold uppercase">CRYSTAL_CORE</div>
                <div className="text-lg font-black text-cyan-400 font-mono tracking-tighter">{fmt(hud.banked.CRYSTAL)}</div>
              </div>
            </div>
          </Card>

          <Card className="p-4 flex-1 bg-slate-950/80 border-slate-800">
             <h2 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">System Access</h2>
             <div className="space-y-2 text-[10px] text-slate-400 font-mono">
               <div className="flex justify-between border-b border-slate-800/30 pb-1"><span>[W]</span> <span className="text-slate-200">THRUST_ARRAY</span></div>
               <div className="flex justify-between border-b border-slate-800/30 pb-1"><span>[A/D]</span> <span className="text-slate-200">NAV_DPAD</span></div>
               <div className="flex justify-between border-b border-slate-800/30 pb-1"><span>[SPACE]</span> <span className="text-slate-200">PULSE_AB</span></div>
               <div className="flex justify-between border-b border-slate-800/30 pb-1"><span>[E]</span> <span className="text-slate-200">SYNC_DOCK</span></div>
             </div>
             <Button variant="outline" className="w-full mt-4 border-slate-800 text-xs h-9" onClick={() => setWalletConnected(!walletConnected)}>
               {walletConnected ? "SYSTEM_LINKED" : "INIT_SYNC"}
             </Button>
          </Card>
        </aside>

        <main className="flex-1 flex flex-col min-h-0 relative">
          <div ref={containerRef} className="relative flex-1 bg-[#020617] rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-800/50 overflow-hidden shadow-2xl">
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-20">
               <div className="bg-slate-950/60 backdrop-blur-lg p-3 rounded-2xl border border-white/5 w-28 md:w-56 shadow-xl">
                  <div className="flex justify-between text-[8px] font-black text-slate-500 uppercase mb-2">
                    <span>HULL_STABILITY</span>
                    <span className={hud.hp < 30 ? "text-red-500 animate-pulse" : "text-blue-400"}>{hud.alive ? "ONLINE" : "OFFLINE"}</span>
                  </div>
                  <div className="space-y-2 md:space-y-3">
                    <Progress value={hud.hp} className="h-1 bg-slate-800/50" />
                    <Progress value={hud.shield} className="h-1 bg-blue-500/20" />
                  </div>
               </div>

               <div className="bg-slate-950/60 backdrop-blur-lg p-3 rounded-2xl border border-white/5 w-28 md:w-56 shadow-xl">
                  <div className="flex justify-between text-[8px] font-black text-slate-500 uppercase mb-2">
                    <span>CARGO_LOAD</span>
                    {hud.multiplier > 1 && (
                      <span className={`font-bold animate-pulse ${hud.multiplier === 4 ? "text-yellow-400" : "text-green-400"}`}>
                        X{hud.multiplier}_ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] font-mono leading-none">
                       <span className="text-slate-500">C</span>
                       <span className="text-amber-400 font-bold">{hud.carried.COIN}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-mono leading-none">
                       <span className="text-slate-500">G</span>
                       <span className="text-pink-400 font-bold">{hud.carried.GORBOY}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-mono leading-none">
                       <span className="text-slate-500">X</span>
                       <span className="text-cyan-400 font-bold">{hud.carried.CRYSTAL}</span>
                    </div>
                  </div>
               </div>
            </div>

            <AnimatePresence>
              {!hud.alive && (
                <MotionDiv 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-8 text-center z-[60]"
                >
                  <div className="max-w-md flex flex-col items-center gap-6">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                       <Skull className="w-10 h-10 animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase italic">CORE_SYNC_LOST</h2>
                      <p className="text-slate-400 text-sm font-light">Structural breach detected. Emergency salvage protocols initiated. Re-link required.</p>
                    </div>
                    <Button className="h-12 px-10 rounded-full bg-red-600 hover:bg-red-500 text-sm font-black flex gap-2 items-center" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR" }))}>
                       <RotateCcw className="w-4 h-4" /> REBOOT_CONSOLE
                    </Button>
                  </div>
                </MotionDiv>
              )}
            </AnimatePresence>

            <div className="lg:hidden absolute inset-x-0 bottom-4 px-4 h-32 flex justify-between items-end pointer-events-none">
              <div className="flex flex-col gap-2 pointer-events-auto">
                 <div className="flex gap-2">
                   <button 
                    onPointerDown={() => setTouchInput('left', true)}
                    onPointerUp={() => setTouchInput('left', false)}
                    onPointerLeave={() => setTouchInput('left', false)}
                    className="w-14 h-14 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-white/10 flex items-center justify-center active:bg-blue-600/50 active:scale-90 transition-all shadow-xl"
                   >
                     <ChevronRight className="w-6 h-6 rotate-180 text-slate-300" />
                   </button>
                   <button 
                    onPointerDown={() => setTouchInput('thrust', true)}
                    onPointerUp={() => setTouchInput('thrust', false)}
                    onPointerLeave={() => setTouchInput('thrust', false)}
                    className="w-14 h-14 bg-blue-600/20 backdrop-blur-md rounded-2xl border border-blue-500/30 flex items-center justify-center active:bg-blue-600/80 active:scale-90 transition-all shadow-xl"
                   >
                     <Navigation className="w-6 h-6 text-blue-400" />
                   </button>
                   <button 
                    onPointerDown={() => setTouchInput('right', true)}
                    onPointerUp={() => setTouchInput('right', false)}
                    onPointerLeave={() => setTouchInput('right', false)}
                    className="w-14 h-14 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-white/10 flex items-center justify-center active:bg-blue-600/50 active:scale-90 transition-all shadow-xl"
                   >
                     <ChevronRight className="w-6 h-6 text-slate-300" />
                   </button>
                 </div>
              </div>

              <div className="flex gap-3 items-end pointer-events-auto">
                <button 
                  onPointerDown={() => setTouchInput('dock', true)}
                  onPointerUp={() => setTouchInput('dock', false)}
                  onPointerLeave={() => setTouchInput('dock', false)}
                  className={`w-14 h-14 rounded-2xl border flex flex-col items-center justify-center transition-all shadow-xl ${hud.dockNearby ? 'bg-blue-600 border-blue-400 animate-pulse' : 'bg-slate-900/60 border-white/10 opacity-40'}`}
                >
                  <Landmark className="w-5 h-5 text-white" />
                  <span className="text-[8px] font-black mt-1 uppercase italic">DOCK</span>
                </button>
                <button 
                  onPointerDown={() => setTouchInput('fire', true)}
                  onPointerUp={() => setTouchInput('fire', false)}
                  onPointerLeave={() => setTouchInput('fire', false)}
                  className="w-16 h-16 bg-blue-600 backdrop-blur-md rounded-full border border-blue-400 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)] active:scale-90 transition-all"
                >
                  <Crosshair className="w-8 h-8 text-white" />
                  <span className="text-[9px] font-black mt-1 uppercase italic">PULSE</span>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      <AnimatePresence>
        {showCharDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl">
            <MotionDiv 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-2xl"
            >
              <h2 className="text-xl font-black mb-6 tracking-tight flex items-center gap-3 text-white uppercase italic">
                 Neural Pilot Sync
              </h2>
              <div className="flex flex-col gap-3">
                {MOCK_CHARACTERS.map(c => (
                  <button 
                    key={c.id}
                    onClick={() => { setSelectedCharacterId(c.id); setShowCharDialog(false); }}
                    className={`group p-4 rounded-2xl border text-left transition-all duration-300 ${
                      selectedCharacterId === c.id 
                        ? "bg-blue-600 border-blue-400 shadow-[0_0_30px_rgba(37,99,235,0.3)]" 
                        : "bg-slate-950 border-slate-800 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex justify-between items-center relative z-10">
                      <div>
                        <div className="font-black text-base text-white">{c.name}</div>
                        <div className="text-[9px] opacity-60 uppercase font-mono mt-1 tracking-widest text-slate-300 italic">{c.flavor}</div>
                      </div>
                      <Badge variant="outline" className={selectedCharacterId === c.id ? "border-white/40 text-white" : "border-slate-800"}>
                        {c.accent}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-8 h-12 rounded-xl border-slate-800 text-slate-500 text-xs" onClick={() => setShowCharDialog(false)}>
                TERMINATE_SYNC
              </Button>
            </MotionDiv>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
