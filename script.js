import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

const app = document.getElementById("app");
const canvas = document.getElementById("gameCanvas");
const checkpointValue = document.getElementById("checkpointValue");
const speedValue = document.getElementById("speedValue");
const statusValue = document.getElementById("statusValue");
const racePrompt = document.getElementById("racePrompt");
const splash = document.getElementById("splash");
const restartButton = document.getElementById("restartButton");
const leftStick = document.getElementById("leftStick");
const stickThumb = document.getElementById("stickThumb");
const accelerateButton = document.getElementById("accelerateButton");

const TRACK_SEGMENTS = 240;
const ROAD_HALF_WIDTH = 8.2;
const CURB_OFFSET = ROAD_HALF_WIDTH + 0.95;
const CHECKPOINT_US = [0.04, 0.16, 0.29, 0.42, 0.54, 0.67, 0.8, 0.92];
const MAX_FORWARD_SPEED = 40;
const MAX_REVERSE_SPEED = -14;
const FORWARD_ACCEL = 28;
const REVERSE_ACCEL = 18;
const STEER_RATE = 2.15;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0a1422");
scene.fog = new THREE.Fog("#0a1422", 95, 270);

const camera = new THREE.PerspectiveCamera(
  52,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);

const cameraLookTarget = new THREE.Vector3();
const forwardVector = new THREE.Vector3();
const upVector = new THREE.Vector3(0, 1, 0);

const controls = {
  touchX: 0,
  touchY: 0,
  accelerate: false,
};

const keys = Object.create(null);

const state = {
  position: new THREE.Vector3(),
  heading: 0,
  speed: 0,
  nextCheckpoint: 1,
  checkpointLock: -1,
  lastSafeU: 0.06,
  offRoadTime: 0,
  won: false,
  started: false,
};

const trackCurve = createTrackCurve();
const trackSamples = createTrackSamples(trackCurve, TRACK_SEGMENTS);
const checkpoints = CHECKPOINT_US.map((u, index) => {
  const frame = getTrackFrame(trackCurve, u);
  return {
    index,
    u,
    point: frame.point,
    tangent: frame.tangent,
    side: frame.side,
    radius: 8.8,
  };
});

const checkpointMarkers = [];

buildScene();
bindControls();
resetRace();
window.addEventListener("resize", onResize);
requestAnimationFrame(animate);

function buildScene() {
  const hemisphere = new THREE.HemisphereLight(0xfff5c9, 0x7b4d2a, 1.6);
  scene.add(hemisphere);

  const sunLight = new THREE.DirectionalLight(0xffedb2, 1.65);
  sunLight.position.set(80, 90, 30);
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x81b4ff, 0.55);
  fillLight.position.set(-70, 26, -60);
  scene.add(fillLight);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(13, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffdb78 })
  );
  sun.position.set(-86, 86, -180);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(320, 64),
    new THREE.MeshStandardMaterial({
      color: 0x8a6339,
      roughness: 1,
      metalness: 0.02,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  scene.add(ground);

  const innerGround = new THREE.Mesh(
    new THREE.CircleGeometry(180, 48),
    new THREE.MeshStandardMaterial({
      color: 0x6f4c2a,
      roughness: 1,
      metalness: 0.02,
    })
  );
  innerGround.rotation.x = -Math.PI / 2;
  innerGround.position.y = -0.02;
  scene.add(innerGround);

  const shoulderMesh = new THREE.Mesh(
    createRibbonGeometry(trackCurve, TRACK_SEGMENTS, ROAD_HALF_WIDTH + 2.2, 0.04),
    new THREE.MeshStandardMaterial({
      color: 0x7b613f,
      roughness: 0.98,
      metalness: 0.02,
    })
  );
  scene.add(shoulderMesh);

  const roadOutline = new THREE.Mesh(
    createRibbonGeometry(trackCurve, TRACK_SEGMENTS, ROAD_HALF_WIDTH + 0.85, 0.055),
    new THREE.MeshStandardMaterial({
      color: 0x12161b,
      roughness: 0.96,
      metalness: 0.03,
    })
  );
  scene.add(roadOutline);

  const roadMesh = new THREE.Mesh(
    createRibbonGeometry(trackCurve, TRACK_SEGMENTS, ROAD_HALF_WIDTH, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0x21272f,
      roughness: 0.8,
      metalness: 0.04,
    })
  );
  scene.add(roadMesh);

  const edgeLines = createEdgeLines();
  scene.add(edgeLines);

  const laneMarks = createLaneMarks();
  scene.add(laneMarks);

  const curbs = createCurbs();
  scene.add(curbs);

  const startGate = createStartGate(CHECKPOINT_US[0]);
  scene.add(startGate);

  const propGroup = createRoadsideProps();
  scene.add(propGroup);

  for (const checkpoint of checkpoints) {
    const marker = createCheckpointMarker(checkpoint);
    checkpointMarkers.push(marker);
    scene.add(marker.group);
  }

  const car = createCar();
  state.car = car;
  scene.add(car);

  updateCheckpointMarkers();
}

function createTrackCurve() {
  const points = [];
  const segments = 42;

  for (let index = 0; index < segments; index += 1) {
    const t = (index / segments) * Math.PI * 2;
    const x = 78 * Math.sin(t);
    const z = 48 * Math.sin(2 * t);
    points.push(new THREE.Vector3(x, 0, z));
  }

  return new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.42);
}

function createTrackSamples(curve, segments) {
  return Array.from({ length: segments }, (_, index) => {
    const u = index / segments;
    return {
      u,
      ...getTrackFrame(curve, u),
    };
  });
}

function getTrackFrame(curve, u) {
  const point = curve.getPointAt(u);
  const tangent = curve.getTangentAt(u).setY(0).normalize();
  const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

  return {
    point,
    tangent,
    side,
  };
}

function createRibbonGeometry(curve, segments, halfWidth, yOffset) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let index = 0; index <= segments; index += 1) {
    const u = index / segments;
    const point = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).setY(0).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const left = point.clone().addScaledVector(side, halfWidth);
    const right = point.clone().addScaledVector(side, -halfWidth);

    left.y = yOffset;
    right.y = yOffset;

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, u * 18, 1, u * 18);

    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return geometry;
}

function createLaneMarks() {
  const group = new THREE.Group();
  const dashGeometry = new THREE.BoxGeometry(2.9, 0.08, 0.34);
  const dashMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4efe2,
    roughness: 0.5,
    metalness: 0.05,
    emissive: 0xe8ddbb,
    emissiveIntensity: 0.08,
  });

  for (let index = 0; index < TRACK_SEGMENTS; index += 6) {
    if ((index / 6) % 2 === 0) {
      continue;
    }

    const u = index / TRACK_SEGMENTS;
    const frame = getTrackFrame(trackCurve, u);
    const dash = new THREE.Mesh(dashGeometry, dashMaterial);
    dash.position.copy(frame.point);
    dash.position.y = 0.13;
    dash.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);
    group.add(dash);
  }

  return group;
}

function createCurbs() {
  const group = new THREE.Group();
  const curbGeometry = new THREE.BoxGeometry(2.8, 0.28, 0.96);
  const curbMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x006847, roughness: 0.78 }),
    new THREE.MeshStandardMaterial({ color: 0xf5efe4, roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ color: 0xce1126, roughness: 0.78 }),
  ];

  for (let index = 0; index < TRACK_SEGMENTS; index += 4) {
    const frame = trackSamples[index];
    const angle = Math.atan2(frame.tangent.x, frame.tangent.z);
    const material = curbMaterials[Math.floor(index / 4) % curbMaterials.length];

    for (const direction of [-1, 1]) {
      const curb = new THREE.Mesh(curbGeometry, material);
      curb.position.copy(frame.point).addScaledVector(frame.side, CURB_OFFSET * direction);
      curb.position.y = 0.16;
      curb.rotation.y = angle;
      group.add(curb);
    }
  }

  return group;
}

function createOffsetRibbonGeometry(curve, segments, offset, halfWidth, yOffset) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let index = 0; index <= segments; index += 1) {
    const u = index / segments;
    const point = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).setY(0).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const center = point.clone().addScaledVector(side, offset);
    const left = center.clone().addScaledVector(side, halfWidth);
    const right = center.clone().addScaledVector(side, -halfWidth);

    left.y = yOffset;
    right.y = yOffset;

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, u * 16, 1, u * 16);

    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return geometry;
}

function createEdgeLines() {
  const group = new THREE.Group();
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf6f0e0,
    emissive: 0x5a4c2c,
    emissiveIntensity: 0.08,
    roughness: 0.42,
    metalness: 0.04,
  });

  const leftLine = new THREE.Mesh(
    createOffsetRibbonGeometry(trackCurve, TRACK_SEGMENTS, ROAD_HALF_WIDTH - 0.48, 0.14, 0.125),
    edgeMaterial
  );
  const rightLine = new THREE.Mesh(
    createOffsetRibbonGeometry(trackCurve, TRACK_SEGMENTS, -(ROAD_HALF_WIDTH - 0.48), 0.14, 0.125),
    edgeMaterial
  );

  group.add(leftLine, rightLine);
  return group;
}

function createStartGate(u) {
  const frame = getTrackFrame(trackCurve, u);
  const group = new THREE.Group();
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4e8c0,
    roughness: 0.38,
    metalness: 0.18,
  });
  const beamMaterial = new THREE.MeshStandardMaterial({
    color: 0x171b22,
    roughness: 0.58,
    metalness: 0.08,
  });
  const postGeometry = new THREE.BoxGeometry(0.7, 5.4, 0.7);
  const crossbar = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 3.8, 0.55, 0.7),
    beamMaterial
  );
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2 + 2.2, 1.7),
    new THREE.MeshBasicMaterial({
      map: createSignTexture("FINISH"),
      transparent: true,
    })
  );

  const leftPost = new THREE.Mesh(postGeometry, postMaterial);
  leftPost.position.set(-(ROAD_HALF_WIDTH + 1.25), 2.7, 0);

  const rightPost = new THREE.Mesh(postGeometry, postMaterial);
  rightPost.position.set(ROAD_HALF_WIDTH + 1.25, 2.7, 0);

  crossbar.position.y = 5.2;
  banner.position.set(0, 4.45, 0.38);

  group.add(leftPost, rightPost, crossbar, banner);
  group.position.copy(frame.point);
  group.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);

  return group;
}

function createSignTexture(text) {
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 1024;
  signCanvas.height = 256;
  const context = signCanvas.getContext("2d");

  context.fillStyle = "#111720";
  context.fillRect(0, 0, signCanvas.width, signCanvas.height);

  const stripeWidth = signCanvas.width / 9;
  const colors = ["#006847", "#f4efe4", "#ce1126"];

  for (let index = 0; index < 9; index += 1) {
    context.fillStyle = colors[index % colors.length];
    context.fillRect(index * stripeWidth, 0, stripeWidth, signCanvas.height);
  }

  context.fillStyle = "rgba(10, 18, 28, 0.76)";
  context.fillRect(28, 20, signCanvas.width - 56, signCanvas.height - 40);

  context.strokeStyle = "rgba(255, 244, 216, 0.92)";
  context.lineWidth = 10;
  context.strokeRect(34, 26, signCanvas.width - 68, signCanvas.height - 52);

  context.fillStyle = "#fff4d0";
  context.font = "900 124px 'Arial Black', Impact, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, signCanvas.width / 2, signCanvas.height / 2 + 6);

  const texture = new THREE.CanvasTexture(signCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRoadsideProps() {
  const group = new THREE.Group();

  for (let index = 0; index < 68; index += 1) {
    const u = (index / 68 + Math.random() * 0.02) % 1;
    const frame = getTrackFrame(trackCurve, u);
    const distance = ROAD_HALF_WIDTH + 11 + Math.random() * 24;
    const sideDirection = Math.random() < 0.5 ? -1 : 1;
    const position = frame.point.clone().addScaledVector(frame.side, distance * sideDirection);

    if (position.length() < 10) {
      continue;
    }

    const prop = Math.random() < 0.68 ? createAgaveProp() : createBannerPoleProp();
    const scale = 0.75 + Math.random() * 0.9;
    prop.position.copy(position);
    prop.rotation.y = Math.random() * Math.PI * 2;
    prop.scale.setScalar(scale);
    group.add(prop);
  }

  return group;
}

function createAgaveProp() {
  const group = new THREE.Group();
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d7d49,
    roughness: 0.92,
    metalness: 0.04,
  });
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0x7c5a32,
    roughness: 0.88,
    metalness: 0.04,
  });
  const leafGeometry = new THREE.ConeGeometry(0.35, 3.2, 4);

  for (let index = 0; index < 6; index += 1) {
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.position.y = 1.45;
    leaf.rotation.z = THREE.MathUtils.degToRad(-58 + index * 19);
    leaf.rotation.y = THREE.MathUtils.degToRad(index * 60);
    group.add(leaf);
  }

  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.44, 0.9, 8), coreMaterial);
  core.position.y = 0.42;
  group.add(core);

  return group;
}

function createBannerPoleProp() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 5.5, 8),
    new THREE.MeshStandardMaterial({
      color: 0xe7dcc0,
      roughness: 0.58,
      metalness: 0.12,
    })
  );
  pole.position.y = 2.75;
  group.add(pole);

  const flagColors = [0x006847, 0xf4efe4, 0xce1126];

  for (let index = 0; index < 3; index += 1) {
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.9),
      new THREE.MeshStandardMaterial({
        color: flagColors[index],
        side: THREE.DoubleSide,
        roughness: 0.75,
      })
    );
    banner.position.set(0.88, 4 - index * 1.05, 0);
    banner.rotation.y = Math.PI / 2;
    group.add(banner);
  }

  return group;
}

function createCheckpointMarker(checkpoint) {
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x4e7d5c,
    emissive: 0x102116,
    emissiveIntensity: 0.4,
    roughness: 0.35,
    metalness: 0.08,
  });
  const beamMaterial = new THREE.MeshStandardMaterial({
    color: 0x6fa480,
    emissive: 0x13261a,
    emissiveIntensity: 0.3,
    roughness: 0.42,
    metalness: 0.04,
  });
  const topMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4d36a,
    emissive: 0x3b2b08,
    emissiveIntensity: 0.26,
    roughness: 0.28,
    metalness: 0.12,
  });

  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.18, 10, 40), ringMaterial);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.8, 10), beamMaterial);
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 0), topMaterial);

  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.22;
  beam.position.y = 1.95;
  top.position.y = 4.05;

  group.add(ring, beam, top);
  group.position.copy(checkpoint.point);

  return {
    group,
    ring,
    beam,
    top,
  };
}

function createCar() {
  const car = new THREE.Group();
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0xdfaa58,
    roughness: 0.68,
    metalness: 0.06,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x171b1f,
    roughness: 0.82,
    metalness: 0.06,
  });
  const shellToastMaterial = new THREE.MeshStandardMaterial({
    color: 0xb26f2d,
    roughness: 0.74,
    metalness: 0.04,
  });
  const meatMaterial = new THREE.MeshStandardMaterial({
    color: 0x744128,
    roughness: 0.9,
    metalness: 0.02,
  });
  const lettuceMaterial = new THREE.MeshStandardMaterial({
    color: 0x4d9a45,
    roughness: 0.88,
    metalness: 0.02,
  });
  const tomatoMaterial = new THREE.MeshStandardMaterial({
    color: 0xcc4432,
    roughness: 0.84,
    metalness: 0.02,
  });
  const cheeseMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2d36a,
    roughness: 0.74,
    metalness: 0.02,
  });
  const creamMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f1df,
    roughness: 0.52,
    metalness: 0.06,
  });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(3, 28),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.2,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.scale.set(1.3, 0.82, 1);
  car.add(shadow);

  const shellShape = new THREE.Shape();
  shellShape.moveTo(-1.75, 0);
  shellShape.quadraticCurveTo(-0.4, 2.2, 0, 2.34);
  shellShape.quadraticCurveTo(0.4, 2.2, 1.75, 0);
  shellShape.lineTo(1.06, 0.18);
  shellShape.quadraticCurveTo(0.24, 1.24, 0, 1.42);
  shellShape.quadraticCurveTo(-0.24, 1.24, -1.06, 0.18);
  shellShape.closePath();

  const shellGeometry = new THREE.ExtrudeGeometry(shellShape, {
    depth: 5.6,
    bevelEnabled: false,
    curveSegments: 24,
  });
  shellGeometry.center();

  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  shell.position.y = 0.76;
  car.add(shell);

  const toastStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.3, 5.3),
    shellToastMaterial
  );
  toastStripe.position.set(1.52, 0.88, 0);
  car.add(toastStripe);

  const toastStripeOpposite = toastStripe.clone();
  toastStripeOpposite.position.x = -1.52;
  car.add(toastStripeOpposite);

  const basePlate = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.22, 5.35), darkMaterial);
  basePlate.position.y = 0.5;
  car.add(basePlate);

  const meatCluster = new THREE.Group();
  const meatGeometry = new THREE.SphereGeometry(0.34, 12, 12);

  for (const [x, y, z, sx, sy, sz] of [
    [-0.48, 1.42, -2.05, 1.3, 0.78, 1.1],
    [0.42, 1.38, -1.2, 1.2, 0.72, 1],
    [-0.38, 1.36, -0.2, 1.35, 0.74, 1.05],
    [0.46, 1.4, 0.74, 1.24, 0.7, 1],
    [-0.42, 1.38, 1.66, 1.28, 0.74, 1.06],
    [0.3, 1.35, 2.34, 1.08, 0.68, 0.9],
  ]) {
    const lump = new THREE.Mesh(meatGeometry, meatMaterial);
    lump.position.set(x, y, z);
    lump.scale.set(sx, sy, sz);
    meatCluster.add(lump);
  }

  car.add(meatCluster);

  const lettuceGeometry = new THREE.SphereGeometry(0.22, 10, 10);

  for (const [x, y, z, scale] of [
    [-0.68, 1.78, -2.1, 1.1],
    [0.08, 1.74, -1.46, 1],
    [0.62, 1.76, -0.72, 1.05],
    [-0.2, 1.8, -0.08, 0.95],
    [-0.62, 1.75, 0.88, 1],
    [0.28, 1.8, 1.54, 1.08],
    [0.72, 1.74, 2.16, 1],
  ]) {
    const leaf = new THREE.Mesh(lettuceGeometry, lettuceMaterial);
    leaf.position.set(x, y, z);
    leaf.scale.setScalar(scale);
    car.add(leaf);
  }

  const cheeseGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.86);

  for (const [x, y, z, rot] of [
    [-0.16, 1.7, -1.86, 0.42],
    [0.26, 1.66, -0.96, -0.2],
    [-0.18, 1.68, 0.18, 0.34],
    [0.18, 1.69, 1.12, -0.36],
    [-0.08, 1.71, 2.02, 0.18],
  ]) {
    const strip = new THREE.Mesh(cheeseGeometry, cheeseMaterial);
    strip.position.set(x, y, z);
    strip.rotation.x = rot;
    car.add(strip);
  }

  const tomatoGeometry = new THREE.BoxGeometry(0.22, 0.2, 0.22);

  for (const [x, y, z] of [
    [0.52, 1.58, -1.88],
    [-0.44, 1.55, -0.86],
    [0.48, 1.58, 0.42],
    [-0.38, 1.56, 1.5],
  ]) {
    const tomato = new THREE.Mesh(tomatoGeometry, tomatoMaterial);
    tomato.position.set(x, y, z);
    tomato.rotation.set(0.2, 0.28, 0.1);
    car.add(tomato);
  }

  const headlightGeometry = new THREE.SphereGeometry(0.12, 10, 10);
  const leftHeadlight = new THREE.Mesh(headlightGeometry, creamMaterial);
  leftHeadlight.position.set(-0.58, 0.88, 2.74);
  car.add(leftHeadlight);

  const rightHeadlight = leftHeadlight.clone();
  rightHeadlight.position.x = 0.58;
  car.add(rightHeadlight);

  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0xca3d2b,
    emissive: 0x50130c,
    emissiveIntensity: 0.14,
    roughness: 0.42,
    metalness: 0.08,
  });
  const leftTaillight = new THREE.Mesh(headlightGeometry, taillightMaterial);
  leftTaillight.position.set(-0.52, 0.86, -2.76);
  car.add(leftTaillight);

  const rightTaillight = leftTaillight.clone();
  rightTaillight.position.x = 0.52;
  car.add(rightTaillight);

  const wheelGeometry = new THREE.CylinderGeometry(0.54, 0.54, 0.62, 18);
  wheelGeometry.rotateZ(Math.PI / 2);

  const wheelOffsets = [
    [-1.54, 0.56, 1.7, true],
    [1.54, 0.56, 1.7, true],
    [-1.54, 0.56, -1.7, false],
    [1.54, 0.56, -1.7, false],
  ];

  const wheels = [];
  const frontHolders = [];

  for (const [x, y, z, steerable] of wheelOffsets) {
    const holder = new THREE.Group();
    const wheel = new THREE.Mesh(wheelGeometry, darkMaterial);

    holder.position.set(x, y, z);
    holder.add(wheel);
    car.add(holder);
    wheels.push(wheel);

    if (steerable) {
      frontHolders.push(holder);
    }
  }

  car.userData.shadow = shadow;
  car.userData.wheels = wheels;
  car.userData.frontHolders = frontHolders;

  return car;
}

function bindControls() {
  bindHoldButton(accelerateButton, "accelerate");

  let stickPointerId = null;

  leftStick.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    stickPointerId = event.pointerId;
    leftStick.classList.add("is-active");
    leftStick.setPointerCapture(event.pointerId);
    updateStick(event);
  });

  leftStick.addEventListener("pointermove", (event) => {
    if (event.pointerId !== stickPointerId) {
      return;
    }

    updateStick(event);
  });

  const releaseStick = (event) => {
    if (stickPointerId !== null && event.pointerId !== stickPointerId) {
      return;
    }

    stickPointerId = null;
    controls.touchX = 0;
    controls.touchY = 0;
    leftStick.classList.remove("is-active");
    stickThumb.style.transform = "translate3d(0, 0, 0)";
  };

  leftStick.addEventListener("pointerup", releaseStick);
  leftStick.addEventListener("pointercancel", releaseStick);
  leftStick.addEventListener("lostpointercapture", releaseStick);

  window.addEventListener("keydown", (event) => {
    if (
      event.code.startsWith("Arrow") ||
      event.code.startsWith("Key") ||
      event.code === "Space" ||
      event.code.startsWith("Shift")
    ) {
      keys[event.code] = true;
    }
  });

  window.addEventListener("keyup", (event) => {
    keys[event.code] = false;
  });

  restartButton.addEventListener("click", resetRace);
}

function bindHoldButton(button, key) {
  const activate = (event) => {
    event.preventDefault();
    controls[key] = true;
    button.classList.add("is-pressed");
    button.setPointerCapture(event.pointerId);
  };

  const release = () => {
    controls[key] = false;
    button.classList.remove("is-pressed");
  };

  button.addEventListener("pointerdown", activate);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("lostpointercapture", release);
}

function updateStick(event) {
  const rect = leftStick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radius = rect.width * 0.32;
  const deltaX = event.clientX - centerX;
  const deltaY = event.clientY - centerY;
  const distance = Math.hypot(deltaX, deltaY) || 1;
  const scale = distance > radius ? radius / distance : 1;
  const nextX = (deltaX * scale) / radius;
  const nextY = (deltaY * scale) / radius;

  controls.touchX = clamp(nextX, -1, 1);
  controls.touchY = clamp(nextY, -1, 1);
  stickThumb.style.transform = `translate3d(${deltaX * scale}px, ${deltaY * scale}px, 0)`;
}

function animate(now) {
  if (!state.lastFrame) {
    state.lastFrame = now;
  }

  const delta = Math.min((now - state.lastFrame) / 1000, 0.033);
  state.lastFrame = now;

  if (!state.won) {
    updateCar(delta);
  }

  updateCamera(delta, false);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateCar(delta) {
  const input = getInputState();
  const driveAxis = input.stickY;
  const steerAxis = input.stickX;
  const wantsReverse = driveAxis > 0.35;
  const driveAmount = clamp(
    Math.max(Math.abs(driveAxis), input.accelerate ? 0.65 : 0),
    0,
    1
  );

  if (!state.started && (input.accelerate || Math.abs(steerAxis) > 0.08 || Math.abs(driveAxis) > 0.08)) {
    state.started = true;
    app.classList.add("started");
  }

  if (input.accelerate) {
    const direction = wantsReverse ? -1 : 1;
    const accel = direction > 0 ? FORWARD_ACCEL : REVERSE_ACCEL;

    if (Math.sign(state.speed) !== 0 && Math.sign(state.speed) !== direction) {
      state.speed += direction * accel * 1.55 * delta;
    } else {
      state.speed += direction * accel * driveAmount * delta;
    }
  } else {
    state.speed = damp(state.speed, 0, 5.4, delta);
  }

  state.speed = clamp(state.speed, MAX_REVERSE_SPEED, MAX_FORWARD_SPEED);

  const nearest = getNearestTrackSample(state.position);
  const offRoad = nearest.distance > ROAD_HALF_WIDTH + 2.5;

  if (offRoad) {
    state.speed *= Math.exp(-delta * 1.75);
    state.offRoadTime += delta;
  } else {
    state.offRoadTime = 0;
    state.lastSafeU = nearest.u;
  }

  if (state.offRoadTime > 2.4) {
    respawnAt(state.lastSafeU);
  }

  const steerGrip = offRoad ? 0.72 : 1;
  const speedFactor = clamp(Math.abs(state.speed) / 18, 0.18, 1);

  if (Math.abs(steerAxis) > 0.01) {
    const movementDirection =
      state.speed === 0 ? (wantsReverse ? -1 : 1) : Math.sign(state.speed);

    state.heading -=
      steerAxis * STEER_RATE * speedFactor * steerGrip * movementDirection * delta;
  }

  forwardVector.set(Math.sin(state.heading), 0, Math.cos(state.heading));
  state.position.addScaledVector(forwardVector, state.speed * delta);
  state.position.y = 0;

  syncCarTransform(steerAxis, delta);
  updateCheckpointProgress();
  updateHUD(offRoad);
}

function getInputState() {
  const keyboardX = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  const keyboardY = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);

  return {
    stickX: clamp(controls.touchX + keyboardX, -1, 1),
    stickY: clamp(controls.touchY + keyboardY, -1, 1),
    accelerate: controls.accelerate || !!keys.ShiftLeft || !!keys.ShiftRight || !!keys.KeyJ,
  };
}

function syncCarTransform(steerAxis, delta) {
  const car = state.car;
  car.position.copy(state.position);
  car.position.y = 0.06;
  car.rotation.y = state.heading;

  const wheelSpin = -state.speed * 0.28 * delta;

  for (const wheel of car.userData.wheels) {
    wheel.rotation.x += wheelSpin;
  }

  const steerVisual = -steerAxis * 0.42;

  for (const holder of car.userData.frontHolders) {
    holder.rotation.y = steerVisual;
  }

  const shadowScale = 1 + Math.min(Math.abs(state.speed) / 90, 0.12);
  car.userData.shadow.scale.set(1.1 * shadowScale, 0.8 * shadowScale, 1);
}

function updateCamera(delta, snap) {
  forwardVector.set(Math.sin(state.heading), 0, Math.cos(state.heading));

  const cameraDistance = 8.8;
  const cameraHeight = 4.1;
  const desiredPosition = state.position
    .clone()
    .addScaledVector(forwardVector, -cameraDistance)
    .addScaledVector(upVector, cameraHeight);
  const desiredLook = state.position
    .clone()
    .addScaledVector(forwardVector, 12)
    .addScaledVector(upVector, 1.5);
  const positionLerp = snap ? 1 : 1 - Math.exp(-delta * 5.5);
  const lookLerp = snap ? 1 : 1 - Math.exp(-delta * 6.2);

  camera.position.lerp(desiredPosition, positionLerp);
  cameraLookTarget.lerp(desiredLook, lookLerp);
  camera.lookAt(cameraLookTarget);
}

function getNearestTrackSample(position) {
  let bestSample = trackSamples[0];
  let bestDistanceSq = Infinity;

  for (const sample of trackSamples) {
    const distanceSq = sample.point.distanceToSquared(position);

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestSample = sample;
    }
  }

  return {
    ...bestSample,
    distance: Math.sqrt(bestDistanceSq),
  };
}

function updateCheckpointProgress() {
  if (state.checkpointLock >= 0) {
    const locked = checkpoints[state.checkpointLock];

    if (state.position.distanceTo(locked.point) > locked.radius * 1.8) {
      state.checkpointLock = -1;
    }
  }

  const target = checkpoints[state.nextCheckpoint];

  if (state.checkpointLock === -1 && state.position.distanceTo(target.point) < target.radius) {
    if (state.nextCheckpoint === 0) {
      triggerWin();
      return;
    }

    state.checkpointLock = state.nextCheckpoint;
    state.nextCheckpoint = (state.nextCheckpoint + 1) % checkpoints.length;
    updateCheckpointMarkers();
  }
}

function updateCheckpointMarkers() {
  for (let index = 0; index < checkpointMarkers.length; index += 1) {
    const marker = checkpointMarkers[index];
    const isNext = index === state.nextCheckpoint;
    const activeColor = isNext ? 0xffd46a : 0x6fa480;
    const ringColor = isNext ? 0xf4efe2 : 0x3b5a45;
    const emissive = isNext ? 0x7a580f : 0x112118;

    marker.group.visible = !state.won;
    marker.ring.material.color.setHex(ringColor);
    marker.ring.material.emissive.setHex(emissive);
    marker.beam.material.color.setHex(activeColor);
    marker.beam.material.emissive.setHex(emissive);
    marker.top.material.emissive.setHex(isNext ? 0x6c500d : 0x3b2b08);
    marker.top.scale.setScalar(isNext ? 1.18 : 0.9);
    marker.group.scale.y = isNext ? 1.15 : 0.9;
  }
}

function updateHUD(offRoad) {
  speedValue.textContent = `${Math.round(Math.abs(state.speed) * 3.1)} mph`;
  checkpointValue.textContent =
    state.nextCheckpoint === 0 ? "Finish" : `${state.nextCheckpoint + 1} / ${checkpoints.length}`;

  if (state.won) {
    statusValue.textContent = "Birthday splash unlocked.";
    return;
  }

  if (offRoad) {
    statusValue.textContent = "Off track. Get back on the asphalt.";
    return;
  }

  if (state.nextCheckpoint === 0) {
    statusValue.textContent = "Final gate. Bring it home.";
    return;
  }

  statusValue.textContent = `Aim for checkpoint ${state.nextCheckpoint + 1}.`;
}

function triggerWin() {
  state.won = true;
  state.speed = 0;
  controls.accelerate = false;
  splash.classList.add("show");
  splash.setAttribute("aria-hidden", "false");
  app.classList.add("show-splash");
  updateCheckpointMarkers();
  updateHUD(false);
}

function resetRace() {
  const spawnU = 0.06;
  const spawnFrame = getTrackFrame(trackCurve, spawnU);

  state.position.copy(spawnFrame.point);
  state.position.y = 0;
  state.heading = Math.atan2(spawnFrame.tangent.x, spawnFrame.tangent.z);
  state.speed = 0;
  state.nextCheckpoint = 1;
  state.checkpointLock = -1;
  state.lastSafeU = spawnU;
  state.offRoadTime = 0;
  state.won = false;
  state.started = false;
  state.lastFrame = performance.now();

  controls.touchX = 0;
  controls.touchY = 0;
  controls.accelerate = false;

  stickThumb.style.transform = "translate3d(0, 0, 0)";
  leftStick.classList.remove("is-active");
  accelerateButton.classList.remove("is-pressed");

  splash.classList.remove("show");
  splash.setAttribute("aria-hidden", "true");
  app.classList.remove("show-splash");
  app.classList.remove("started");

  syncCarTransform(0, 0);
  updateCheckpointMarkers();
  updateHUD(false);
  updateCamera(0, true);
}

function respawnAt(u) {
  const frame = getTrackFrame(trackCurve, (u + 0.012) % 1);
  state.position.copy(frame.point);
  state.heading = Math.atan2(frame.tangent.x, frame.tangent.z);
  state.speed = 0;
  state.offRoadTime = 0;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function damp(value, target, lambda, delta) {
  return THREE.MathUtils.lerp(value, target, 1 - Math.exp(-lambda * delta));
}
