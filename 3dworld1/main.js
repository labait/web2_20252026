import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────────────────
const TERRAIN_SIZE  = 280;
const TERRAIN_SEGS  = 130;
const CURVATURE_R   = 550;   // smaller = more pronounced curvature

// Densità foresta: passo griglia in unità. Valori consigliati:
//   4 = foresta fitta  |  8 = foresta media  |  14 = rado boschetto
const TREE_DENSITY  = 8;

// ─────────────────────────────────────────────────────────────────────────────
//  Items — lista degli oggetti interattivi nel mondo
//  Ogni item: { code, title, description, letter, symbol, position }
//  symbol.type = 'string'  → visualizza symbol.content come texture 3D
//  symbol.type = 'object'  → carica symbol.path da ./objects/*.obj
// ─────────────────────────────────────────────────────────────────────────────
const items = [
    {
        code:        'item-alpha',
        title:       'Alpha',
        description: 'Il primo elemento testuale',
        letter:      'A',
        symbol:      { type: 'string', content: 'ciao' },
        position:    { x: -10, z: -12 },
    },
    {
        code:        'item-sphere',
        title:       'Sfera',
        description: 'Una sfera caricata da file OBJ',
        letter:      'S',
        symbol:      { type: 'object', path: './objects/sphere.obj' },
        position:    { x: 13, z: -15 },
    },
    {
        code:        'item-cube',
        title:       'Cubo',
        description: 'Un cubo caricato da file OBJ',
        letter:      'C',
        symbol:      { type: 'object', path: './objects/cube.obj' },
        position:    { x: -2, z: 13 },
    },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Terrain height function  (curvature + layered sine noise)
// ─────────────────────────────────────────────────────────────────────────────
function terrainH(x, z) {
    // Spherical-cap curvature: earth bends away from us
    const curve = -(x * x + z * z) / (2 * CURVATURE_R);
    // Layered noise for uneven, bucolic ground
    const n =
        Math.sin(x * 0.09  + 0.3) * Math.cos(z * 0.07  + 0.1) * 0.65 +
        Math.sin(x * 0.05  + 2.1) * Math.cos(z * 0.06  + 1.3) * 0.85 +
        Math.sin(x * 0.18  + 0.7) * Math.cos(z * 0.14  + 0.9) * 0.28 +
        Math.sin(x * 0.35  + 1.0) * Math.cos(z * 0.30  + 0.5) * 0.10;
    return curve + n;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Renderer
// ─────────────────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ─────────────────────────────────────────────────────────────────────────────
//  Scene
// ─────────────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4a7a5a);   // verde scuro tra le chiome
scene.fog = new THREE.Fog(0x3a6040, 8, 80);      // fog fitto, ravvicinato — senso foresta

// ─────────────────────────────────────────────────────────────────────────────
//  Camera
// ─────────────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);

// ─────────────────────────────────────────────────────────────────────────────
//  Lighting
// ─────────────────────────────────────────────────────────────────────────────
// Warm ambient
const ambient = new THREE.AmbientLight(0xfff4dc, 0.65);
scene.add(ambient);

// Sun (directional)
const sun = new THREE.DirectionalLight(0xfff0b0, 1.25);
sun.position.set(70, 130, 50);
sun.castShadow = true;
sun.shadow.mapSize.width  = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near   = 0.5;
sun.shadow.camera.far    = 320;
sun.shadow.camera.left   = -110;
sun.shadow.camera.right  =  110;
sun.shadow.camera.top    =  110;
sun.shadow.camera.bottom = -110;
scene.add(sun);

// Hemisphere (sky blue ↔ earth green) — più scura per senso di foresta
const hemi = new THREE.HemisphereLight(0x6aabcc, 0x2a5a20, 0.55);
scene.add(hemi);

// ─────────────────────────────────────────────────────────────────────────────
//  Terrain mesh
// ─────────────────────────────────────────────────────────────────────────────
const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
terrainGeo.rotateX(-Math.PI / 2);
const posAttr = terrainGeo.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
    posAttr.setY(i, terrainH(posAttr.getX(i), posAttr.getZ(i)));
}
terrainGeo.computeVertexNormals();

const terrainMesh = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshLambertMaterial({ color: 0x4a8b3a })
);
terrainMesh.receiveShadow = true;
scene.add(terrainMesh);

// ─────────────────────────────────────────────────────────────────────────────
//  Trees
// ─────────────────────────────────────────────────────────────────────────────
const treeWindData  = [];   // { leavesRoot, phase }
const treeColliders = [];   // { x, z, r }  — raggio di collisione per ogni albero

// Posizioni vietate: zona spawn + posizioni items
const CLEAR_ZONES = [
    { x:  0,  z:  0,   r: 5 },   // spawn
    ...items.map(it => ({ x: it.position.x, z: it.position.z, r: 4 })),
];

function isClear(x, z) {
    return CLEAR_ZONES.every(c => (x - c.x) ** 2 + (z - c.z) ** 2 > c.r ** 2);
}

function makeTree(x, z) {
    const group = new THREE.Group();

    // Alberi alti: trunk tra 5 e 10 unità
    const scale   = 1.6 + Math.random() * 1.4;   // moltiplicatore globale
    const trunkH  = (3.5 + Math.random() * 3.0) * scale;
    const trunkR0 = 0.18 * scale;
    const trunkR1 = 0.32 * scale;

    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(trunkR0, trunkR1, trunkH, 8),
        new THREE.MeshLambertMaterial({ color: 0x5a3318 })
    );
    trunk.position.y = trunkH * 0.5;
    trunk.castShadow = true;
    group.add(trunk);

    // Chioma: più cluster, più grande
    const leavesRoot = new THREE.Group();
    leavesRoot.position.y = trunkH * 0.72;

    const leafColor = new THREE.Color(0x1e5c1a).lerp(
        new THREE.Color(0x2e7a30),
        Math.random()
    );
    const leafMat = new THREE.MeshLambertMaterial({ color: leafColor });

    const cs = scale;  // cluster scale
    const clusters = [
        { p: [ 0,    2.2 * cs,  0        ], r: 2.2 * cs },
        { p: [ 0,    3.6 * cs,  0        ], r: 1.7 * cs },
        { p: [ 0,    4.7 * cs,  0        ], r: 1.2 * cs },
        { p: [ 0,    5.4 * cs,  0        ], r: 0.8 * cs },
        { p: [ 1.4 * cs, 1.6 * cs,  0.6 * cs], r: 1.3 * cs },
        { p: [-1.2 * cs, 1.5 * cs, -0.5 * cs], r: 1.25 * cs },
        { p: [ 0.5 * cs, 1.3 * cs, -1.3 * cs], r: 1.15 * cs },
        { p: [-0.6 * cs, 1.7 * cs,  1.2 * cs], r: 1.1 * cs },
        { p: [ 1.5 * cs, 2.8 * cs, -0.4 * cs], r: 1.0 * cs },
        { p: [-1.3 * cs, 2.6 * cs,  0.7 * cs], r: 0.95 * cs },
    ];

    for (const c of clusters) {
        const leaf = new THREE.Mesh(
            new THREE.SphereGeometry(c.r, 9, 7),
            leafMat
        );
        leaf.position.set(...c.p);
        leaf.castShadow = true;
        leavesRoot.add(leaf);
    }

    // Rami secondari
    const branchMat = new THREE.MeshLambertMaterial({ color: 0x6a4020 });
    const branchDefs = [
        { dir: [ 1,  0.45,  0.1 ], len: 2.2 * scale },
        { dir: [-1,  0.40,  0.3 ], len: 2.0 * scale },
        { dir: [ 0.2, 0.5, -1   ], len: 2.1 * scale },
        { dir: [-0.3, 0.55, 1   ], len: 1.9 * scale },
    ];
    for (const b of branchDefs) {
        const bMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04 * scale, 0.10 * scale, b.len, 5),
            branchMat
        );
        const dir = new THREE.Vector3(...b.dir).normalize();
        bMesh.position.copy(dir).multiplyScalar(b.len / 2)
            .add(new THREE.Vector3(0, trunkH * 0.78, 0));
        bMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        group.add(bMesh);
    }

    group.add(leavesRoot);
    group.position.set(x, terrainH(x, z), z);

    // Raggio collisione = base del tronco + margine personaggio
    treeColliders.push({ x, z, r: trunkR1 + 0.45 });
    treeWindData.push({ leavesRoot, phase: Math.random() * Math.PI * 2 });
    return group;
}

// Griglia densa di alberi (passo ~8 unità) con offset casuale → foresta
const TREE_SPREAD = 110;

for (let gx = -TREE_SPREAD; gx <= TREE_SPREAD; gx += TREE_DENSITY) {
    for (let gz = -TREE_SPREAD; gz <= TREE_SPREAD; gz += TREE_DENSITY) {
        // Jitter casuale per evitare griglia meccanica
        const jx = gx + (Math.random() - 0.5) * TREE_DENSITY * 1.2;
        const jz = gz + (Math.random() - 0.5) * TREE_DENSITY * 1.2;
        if (isClear(jx, jz)) {
            scene.add(makeTree(jx, jz));
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Items — costruzione mesh 3D per ogni item dell'array
// ─────────────────────────────────────────────────────────────────────────────
const clickables    = [];          // oggetti per il raycaster
const animatedItems = [];          // { root, itemIndex } per float+spin

const objLoader   = new OBJLoader();
const itemColors  = [0x4466dd, 0xdd6644, 0x44bb66];   // colore per item OBJ
const ITEM_HEIGHT = 1.8;           // altezza base dal suolo

// Canvas texture per item di tipo "string"
// Dimensione font predefinita per i simboli di tipo "string"
const STRING_FONT_SIZE = 96;   // px sul canvas

function buildStringMesh(content) {
    // Canvas proporzionato al testo
    const cv  = document.createElement('canvas');
    cv.width  = 512;
    cv.height = 160;
    const ctx = cv.getContext('2d');

    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.font         = `${STRING_FONT_SIZE}px sans-serif`;
    ctx.fillStyle    = '#ffffff';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(content, cv.width / 2, cv.height / 2);

    const tex    = new THREE.CanvasTexture(cv);
    const aspect = cv.width / cv.height;          // mantiene le proporzioni
    const mesh   = new THREE.Mesh(
        new THREE.PlaneGeometry(aspect * 1.6, 1.6),
        new THREE.MeshBasicMaterial({
            map:         tex,
            transparent: true,
            side:        THREE.DoubleSide,
            depthWrite:  false,
        })
    );
    return mesh;
}

// Posiziona e registra un root mesh nella scena
function spawnItem(item, root, idx) {
    const { x, z } = item.position;
    // Normalizza scala se è un gruppo OBJ
    if (root.isGroup || root.children.length) {
        const box = new THREE.Box3().setFromObject(root);
        const sz  = box.getSize(new THREE.Vector3());
        const max = Math.max(sz.x, sz.y, sz.z) || 1;
        root.scale.setScalar(3.2 / max);
    }
    root.position.set(x, terrainH(x, z) + ITEM_HEIGHT, z);
    // Propaga itemCode a tutti i discendenti (per raycasting ricorsivo)
    root.userData.itemCode = item.code;
    root.traverse(child => { child.userData.itemCode = item.code; });
    root.castShadow = true;
    scene.add(root);
    clickables.push(root);
    animatedItems.push({ root, idx });
}

// Costruisce la mesh per ogni item
function buildItems() {
    const fallbackColors = [0xff5533, 0x5533ff, 0x33ff55];

    items.forEach((item, idx) => {
        const { type, content, path } = item.symbol;

        if (type === 'string') {
            spawnItem(item, buildStringMesh(content), idx);

        } else if (type === 'object' && path) {
            objLoader.load(
                path,
                group => {
                    // Applica materiale ai child mesh
                    group.traverse(child => {
                        if (child.isMesh) {
                            child.material = new THREE.MeshLambertMaterial({
                                color: itemColors[idx % itemColors.length],
                            });
                            child.castShadow = true;
                        }
                    });
                    spawnItem(item, group, idx);
                },
                undefined,
                err => {
                    // Fallback visibile se il file non si carica
                    console.warn(`[3DWorld] impossibile caricare ${path}:`, err);
                    const fb = new THREE.Mesh(
                        new THREE.BoxGeometry(1.5, 1.5, 1.5),
                        new THREE.MeshLambertMaterial({
                            color: fallbackColors[idx % fallbackColors.length],
                            wireframe: true,
                        })
                    );
                    spawnItem(item, fb, idx);
                }
            );
        }
    });
}

buildItems();

// ─────────────────────────────────────────────────────────────────────────────
//  Personaggio stilizzato  (visibile solo in modalità TPS)
// ─────────────────────────────────────────────────────────────────────────────
const skinMat  = new THREE.MeshLambertMaterial({ color: 0xf5c49a });
const bodyMat  = new THREE.MeshLambertMaterial({ color: 0x3366bb });
const pantsMat = new THREE.MeshLambertMaterial({ color: 0x223355 });
const hairMat  = new THREE.MeshLambertMaterial({ color: 0x3b2210 });

function makeLimb(w, h, d, mat) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

const playerGroup = new THREE.Group();

// Testa
const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skinMat);
head.position.y = 1.56;
head.castShadow = true;
playerGroup.add(head);

// Capelli (piccola scatola sopra la testa)
const hair = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.42), hairMat);
hair.position.y = 1.78;
playerGroup.add(hair);

// Torso
const torso = makeLimb(0.46, 0.52, 0.24, bodyMat);
torso.position.y = 1.08;
torso.castShadow = true;
playerGroup.add(torso);

// Braccia — pivot all'altezza della spalla, mesh offset verso il basso
const leftArmPivot  = new THREE.Group();
const rightArmPivot = new THREE.Group();
leftArmPivot.position.set( 0.31, 1.30, 0);
rightArmPivot.position.set(-0.31, 1.30, 0);

const leftArm  = makeLimb(0.13, 0.44, 0.13, bodyMat);
const rightArm = makeLimb(0.13, 0.44, 0.13, bodyMat);
leftArm.position.y  = -0.22;
rightArm.position.y = -0.22;
leftArm.castShadow  = true;
rightArm.castShadow = true;
leftArmPivot.add(leftArm);
rightArmPivot.add(rightArm);
playerGroup.add(leftArmPivot, rightArmPivot);

// Gambe — pivot all'altezza del bacino
const leftLegPivot  = new THREE.Group();
const rightLegPivot = new THREE.Group();
leftLegPivot.position.set( 0.13, 0.78, 0);
rightLegPivot.position.set(-0.13, 0.78, 0);

const leftLeg  = makeLimb(0.16, 0.52, 0.16, pantsMat);
const rightLeg = makeLimb(0.16, 0.52, 0.16, pantsMat);
leftLeg.position.y  = -0.26;
rightLeg.position.y = -0.26;
leftLeg.castShadow  = true;
rightLeg.castShadow = true;
leftLegPivot.add(leftLeg);
rightLegPivot.add(rightLeg);
playerGroup.add(leftLegPivot, rightLegPivot);

playerGroup.visible = false;
scene.add(playerGroup);

// Fase dell'animazione camminata (avanza solo quando ci si muove)
let walkPhase = 0;

// ─────────────────────────────────────────────────────────────────────────────
//  Character state
// ─────────────────────────────────────────────────────────────────────────────
const char = {
    pos:       new THREE.Vector3(0, terrainH(0, 0), 0),
    yaw:       0,          // radians, Y-axis rotation
    speed:     7.0,        // units/s forward
    turnSpeed: 1.80,       // rad/s
    eyeH:      1.70,       // eye height above terrain
};

// ─────────────────────────────────────────────────────────────────────────────
//  Camera mode
// ─────────────────────────────────────────────────────────────────────────────
let camMode   = 'fps';   // 'fps' | 'tps'
let spaceDown = false;

const camModeText  = document.getElementById('cam-mode-text');
const crosshairEl  = document.getElementById('crosshair');

// ─────────────────────────────────────────────────────────────────────────────
//  Input
// ─────────────────────────────────────────────────────────────────────────────
const keys = new Set();

window.addEventListener('keydown', e => {
    keys.add(e.code);
    // Prevent page scroll
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
        e.preventDefault();
    }
    // Toggle camera mode on space (single-press)
    if (e.code === 'Space' && !spaceDown) {
        spaceDown = true;
        camMode = camMode === 'fps' ? 'tps' : 'fps';
        camModeText.textContent  = camMode === 'fps' ? 'Prima persona' : 'Terza persona';
        crosshairEl.style.opacity = camMode === 'fps' ? '1' : '0.35';
    }
});

window.addEventListener('keyup', e => {
    keys.delete(e.code);
    if (e.code === 'Space') spaceDown = false;
});

// ─────────────────────────────────────────────────────────────────────────────
//  Click → raycaster
// ─────────────────────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();

renderer.domElement.addEventListener('click', e => {
    const ndc = new THREE.Vector2(
        (e.clientX / window.innerWidth)  * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    // recursive:true → funziona anche con gruppi OBJ
    const hits = raycaster.intersectObjects(clickables, true);
    if (hits.length > 0) {
        // Risali la gerarchia per trovare l'itemCode
        let obj = hits[0].object;
        while (obj && !obj.userData.itemCode) obj = obj.parent;
        if (obj?.userData.itemCode) {
            console.log(obj.userData.itemCode);
        }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Resize
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
const HALF_TERRAIN = TERRAIN_SIZE / 2 - 6;
const _fwd  = new THREE.Vector3();
const _eye  = new THREE.Vector3();
const _tgt  = new THREE.Vector3();
const _tpsP = new THREE.Vector3();

// ─────────────────────────────────────────────────────────────────────────────
//  Animation loop
// ─────────────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t  = clock.getElapsedTime();

    // ── Character movement ──────────────────────────────────────────────────
    if (keys.has('ArrowLeft'))  char.yaw += char.turnSpeed * dt;
    if (keys.has('ArrowRight')) char.yaw -= char.turnSpeed * dt;

    _fwd.set(Math.sin(char.yaw), 0, Math.cos(char.yaw));

    if (keys.has('ArrowUp'))   char.pos.addScaledVector(_fwd,  char.speed * dt);
    if (keys.has('ArrowDown')) char.pos.addScaledVector(_fwd, -char.speed * dt);

    // Clamp within terrain
    char.pos.x = THREE.MathUtils.clamp(char.pos.x, -HALF_TERRAIN, HALF_TERRAIN);
    char.pos.z = THREE.MathUtils.clamp(char.pos.z, -HALF_TERRAIN, HALF_TERRAIN);

    // Collisione con i tronchi degli alberi (push-out circolare)
    for (const col of treeColliders) {
        const dx   = char.pos.x - col.x;
        const dz   = char.pos.z - col.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < col.r && dist > 0.001) {
            const inv = col.r / dist;
            char.pos.x = col.x + dx * inv;
            char.pos.z = col.z + dz * inv;
        }
    }

    // Stick to terrain surface
    char.pos.y = terrainH(char.pos.x, char.pos.z);

    // ── Camera update ───────────────────────────────────────────────────────
    _eye.copy(char.pos).y += char.eyeH;

    if (camMode === 'fps') {
        camera.position.copy(_eye);
        _tgt.copy(_eye).addScaledVector(_fwd, 12);
        camera.lookAt(_tgt);
    } else {
        // TPS: smooth follow behind+above character
        _tpsP.copy(char.pos)
            .addScaledVector(_fwd, -3.5)
            .setY(char.pos.y + char.eyeH + 1.6);
        camera.position.lerp(_tpsP, Math.min(8 * dt, 1));
        camera.lookAt(_eye);
    }

    // ── Personaggio stilizzato (solo TPS) ──────────────────────────────────
    const isMoving = keys.has('ArrowUp') || keys.has('ArrowDown');
    playerGroup.visible = (camMode === 'tps');
    if (camMode === 'tps') {
        playerGroup.position.copy(char.pos);
        playerGroup.rotation.y = char.yaw;

        // Avanza la fase solo quando si cammina
        if (isMoving) walkPhase += dt * 7.5;

        // Swing gambe e braccia (opposto tra loro)
        const swing = Math.sin(walkPhase) * (isMoving ? 0.55 : 0.0);
        leftLegPivot.rotation.x  =  swing;
        rightLegPivot.rotation.x = -swing;
        leftArmPivot.rotation.x  = -swing * 0.55;
        rightArmPivot.rotation.x =  swing * 0.55;

        // Lieve bob verticale del corpo durante il passo
        playerGroup.position.y += isMoving ? Math.abs(Math.sin(walkPhase)) * 0.04 : 0;
    }

    // ── Item animation: float & spin ───────────────────────────────────────
    for (const { root, idx } of animatedItems) {
        root.rotation.y += dt * 0.55;
        const { x, z } = items[idx].position;
        root.position.y = terrainH(x, z) + ITEM_HEIGHT
                        + Math.sin(t * 1.6 + idx * 1.4) * 0.18;
    }

    // ── Wind on trees ───────────────────────────────────────────────────────
    for (const { leavesRoot, phase } of treeWindData) {
        leavesRoot.rotation.z = Math.sin(t * 0.75 + phase)       * 0.07;
        leavesRoot.rotation.x = Math.sin(t * 0.55 + phase + 1.3) * 0.055;
    }

    renderer.render(scene, camera);
}

animate();
