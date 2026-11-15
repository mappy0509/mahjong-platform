import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { doraFromIndicator, isAkaTile, type Meld, type RoundView, type Tile } from '@mj/core';

/**
 * 卓の3D描画。牌は「象牙色の表＋色付きの背」の角丸の箱で、表面に絵柄のテクスチャを貼る。
 * 盤面(RoundView)を渡すと、牌ごとの置き場所を計算して、いまの位置から滑らかに動かす。
 */

export const TW = 1.0; // 牌の幅
export const TH = 1.34; // 牌の高さ（絵柄の縦）
export const TT = 0.74; // 牌の厚み
const BACK_T = 0.27; // 背の色の層の厚み
const HALF = 8.7; // 卓の半分の大きさ
const CENTER_HALF = 2.35;
const STICK_Z = 2.62;
const RIVER_Z0 = 3.56;
const HAND_Z = 7.75;
const MY_HAND_Z = 8.05;
const MELD_Z = 7.95;

export interface SceneTheme {
  felt: string;
  feltDark: string;
  tileBack: string;
  frame: string;
}

export const THEMES: Record<string, SceneTheme> = {
  jade: { felt: '#1d6b5c', feltDark: '#0f3d36', tileBack: '#e2a33a', frame: '#2a2f38' },
  indigo: { felt: '#27457a', feltDark: '#13254a', tileBack: '#3fb6a8', frame: '#23262e' },
  wine: { felt: '#6b2338', feltDark: '#3a1020', tileBack: '#2d6fb3', frame: '#2b2526' },
};

function tileFile(t: Tile): string {
  const k = t >> 2;
  const s = k < 27 ? 'mps'[Math.floor(k / 9)] : 'z';
  if (isAkaTile(t)) return `${s}0`;
  return `${s}${k < 27 ? (k % 9) + 1 : k - 26}`;
}

interface TileObj {
  key: string;
  group: THREE.Group;
  body: THREE.Mesh;
  face: THREE.Mesh | null;
  tile: Tile | null;
  tween: Tween | null;
  /** 自分の手牌か（クリック判定用） */
  mine: boolean;
  dim: boolean;
  lift: number;
  base: THREE.Vector3;
}

interface Tween {
  from: THREE.Vector3;
  to: THREE.Vector3;
  qFrom: THREE.Quaternion;
  qTo: THREE.Quaternion;
  t0: number;
  dur: number;
  arc: number;
  delay: number;
}

interface Placement {
  key: string;
  tile: Tile | null;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  mine?: boolean;
  /** 新しく現れる牌の出どころ（無ければその場に出す） */
  spawn?: { pos: THREE.Vector3; quat: THREE.Quaternion };
  arc?: number;
  shadow?: boolean;
  scale?: number;
}

const Q_LYING = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const Q_FACEDOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const Q_SIDE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

export interface SceneCallbacks {
  onTile?(tile: Tile, touch: boolean): void;
  onHover?(tile: Tile | null): void;
}

export class TableScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(33, 16 / 9, 0.1, 200);
  private objs = new Map<string, TileObj>();
  private bodyGeo: THREE.BufferGeometry;
  private bodyMat: THREE.MeshStandardMaterial;
  private bodyDimMat: THREE.MeshStandardMaterial;
  private bodyDoraMat: THREE.MeshStandardMaterial;
  private doraKinds = new Set<number>();
  private faceGeo: THREE.PlaneGeometry;
  private faceMats = new Map<string, THREE.MeshStandardMaterial>();
  private faceDimMats = new Map<string, THREE.MeshStandardMaterial>();
  private textures = new Map<string, THREE.Texture>();
  private centerTex: THREE.CanvasTexture;
  private centerCanvas: HTMLCanvasElement;
  private sticks: THREE.Mesh[] = [];
  private marker: THREE.Mesh;
  private turnLights: THREE.Mesh[] = [];
  private raf = 0;
  private clock = performance.now();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-9, -9);
  private hovered: TileObj | null = null;
  private selected: Tile | null = null;
  private selectable: Set<Tile> | null = null;
  private interactive = false;
  private mySeat = 0;
  private n = 4;
  private view: RoundView | null = null;
  private reveals = new Map<number, Tile[]>();
  private shake = 0;
  private disposed = false;
  private theme: SceneTheme;
  private felt!: THREE.Mesh;
  private camBase = new THREE.Vector3();
  private key = new THREE.DirectionalLight(0xfff4e0, 1.9);
  ready: Promise<void>;

  constructor(private canvas: HTMLCanvasElement, private cb: SceneCallbacks = {}, theme: SceneTheme = THEMES.jade) {
    this.theme = theme;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color('#05080b');

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    // 光
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x1a1410, 0.55));
    this.key.position.set(-7, 22, 9);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 60;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 5;
    this.scene.add(this.key);
    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.5);
    fill.position.set(10, 12, -8);
    this.scene.add(fill);

    // 牌の形（表の象牙色の層 + 背の色の層）
    const front = new RoundedBoxGeometry(TW * 0.965, TH * 0.975, TT - BACK_T, 4, 0.085);
    front.translate(0, 0, BACK_T / 2);
    const back = new RoundedBoxGeometry(TW * 0.965, TH * 0.975, BACK_T + 0.08, 4, 0.085);
    back.translate(0, 0, -TT / 2 + (BACK_T + 0.08) / 2);
    this.paint(front, new THREE.Color('#f4eedf'));
    this.paint(back, new THREE.Color(theme.tileBack));
    this.bodyGeo = mergeGeometries([front, back])!;
    this.bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.0, envMapIntensity: 0.9 });
    this.bodyDimMat = this.bodyMat.clone();
    this.bodyDimMat.color = new THREE.Color('#6d7178');
    // ドラ: 牌そのものがほんのり金色に光る
    this.bodyDoraMat = this.bodyMat.clone();
    this.bodyDoraMat.emissive = new THREE.Color('#ffb21a');
    this.bodyDoraMat.emissiveIntensity = 0.3;
    this.faceGeo = new THREE.PlaneGeometry(TW * 0.83, TH * 0.83 * (400 / 300) * (TW / TH));

    this.buildTable();
    this.centerCanvas = document.createElement('canvas');
    this.centerCanvas.width = this.centerCanvas.height = 1024;
    this.centerTex = new THREE.CanvasTexture(this.centerCanvas);
    this.centerTex.colorSpace = THREE.SRGBColorSpace;
    this.centerTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.buildCenter();

    // 最後の捨て牌の目印
    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.36, 4),
      new THREE.MeshBasicMaterial({ color: '#ffd76a' }),
    );
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.ready = this.loadTextures();
    this.resize();
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('resize', this.resize);
    this.loop();
  }

  private paint(g: THREE.BufferGeometry, c: THREE.Color) {
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }

  private async loadTextures() {
    const names: string[] = [];
    for (const s of ['m', 'p', 's']) for (let i = 0; i <= 9; i++) names.push(`${s}${i}`);
    for (let i = 1; i <= 7; i++) names.push(`z${i}`);
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    await Promise.all(
      names.map(
        (name) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              c.width = 240; c.height = 320;
              const ctx = c.getContext('2d')!;
              ctx.drawImage(img, 0, 0, 240, 320);
              const tex = new THREE.CanvasTexture(c);
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = aniso;
              tex.generateMipmaps = true;
              this.textures.set(name, tex);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = `/tiles/${name}.svg`;
          }),
      ),
    );
    // 読み込み前に作った牌へ絵柄を付け直す
    for (const m of this.faceMats.values()) m.needsUpdate = true;
    for (const [name, m] of this.faceMats) { m.map = this.textures.get(name) ?? null; m.needsUpdate = true; }
    for (const [name, m] of this.faceDimMats) { m.map = this.textures.get(name) ?? null; m.needsUpdate = true; }
  }

  private faceMat(name: string, dim: boolean): THREE.MeshStandardMaterial {
    const cache = dim ? this.faceDimMats : this.faceMats;
    let m = cache.get(name);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        map: this.textures.get(name) ?? null, transparent: true, roughness: 0.75, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        color: dim ? '#777b82' : '#ffffff', envMapIntensity: 0.15,
      });
      cache.set(name, m);
    }
    return m;
  }

  // ---- 卓 ----

  private feltTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(512, 512, 80, 512, 512, 760);
    g.addColorStop(0, this.theme.felt);
    g.addColorStop(1, this.theme.feltDark);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 1024);
    // 布の細かい目
    const img = ctx.getImageData(0, 0, 1024, 1024);
    const d = img.data;
    let seed = 12345;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const nz = ((seed >>> 24) / 255 - 0.5) * 16;
      d[i] += nz; d[i + 1] += nz; d[i + 2] += nz;
    }
    ctx.putImageData(img, 0, 0);
    // 飾りの線
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 3;
    ctx.strokeRect(54, 54, 916, 916);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(70, 70, 884, 884);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  private buildTable() {
    this.felt = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2, HALF * 2),
      new THREE.MeshStandardMaterial({ map: this.feltTexture(), roughness: 0.95, metalness: 0, envMapIntensity: 0.15 }),
    );
    this.felt.rotation.x = -Math.PI / 2;
    this.felt.receiveShadow = true;
    this.scene.add(this.felt);

    const frameMat = new THREE.MeshStandardMaterial({ color: this.theme.frame, roughness: 0.35, metalness: 0.55, envMapIntensity: 1.0 });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#c9a45a', roughness: 0.3, metalness: 0.9, envMapIntensity: 1.2 });
    const w = 1.1, h = 0.55;
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new RoundedBoxGeometry(HALF * 2 + w * 2, h, w, 3, 0.12), frameMat);
      const a = (i * Math.PI) / 2;
      bar.position.set(Math.sin(a) * (HALF + w / 2), h / 2 - 0.08, Math.cos(a) * (HALF + w / 2));
      bar.rotation.y = a;
      bar.castShadow = true; bar.receiveShadow = true;
      this.scene.add(bar);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.04, 0.06), trimMat);
      trim.position.set(Math.sin(a) * (HALF - 0.02), 0.03, Math.cos(a) * (HALF - 0.02));
      trim.rotation.y = a;
      this.scene.add(trim);
    }
    // 卓の外の床
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: '#07090c', roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.4;
    this.scene.add(floor);
  }

  private buildCenter() {
    const base = new THREE.Mesh(
      new RoundedBoxGeometry(CENTER_HALF * 2, 0.34, CENTER_HALF * 2, 4, 0.14),
      new THREE.MeshStandardMaterial({ color: '#12161c', roughness: 0.3, metalness: 0.7, envMapIntensity: 1.1 }),
    );
    base.position.y = 0.17;
    base.castShadow = true; base.receiveShadow = true;
    this.scene.add(base);
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(CENTER_HALF * 2 - 0.22, CENTER_HALF * 2 - 0.22),
      new THREE.MeshBasicMaterial({ map: this.centerTex, toneMapped: false }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.345;
    this.scene.add(top);
    // 手番の光
    for (let r = 0; r < 4; r++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(CENTER_HALF * 2 - 0.9, 0.05, 0.16),
        new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0, toneMapped: false }),
      );
      const a = (r * Math.PI) / 2;
      m.position.set(Math.sin(a) * (CENTER_HALF - 0.02), 0.36, Math.cos(a) * (CENTER_HALF - 0.02));
      m.rotation.y = a;
      this.scene.add(m);
      this.turnLights.push(m);
    }
    // 立直棒
    const stickGeo = new RoundedBoxGeometry(3.3, 0.13, 0.24, 2, 0.06);
    const stickMat = new THREE.MeshStandardMaterial({ color: '#f5f2ea', roughness: 0.3 });
    for (let r = 0; r < 4; r++) {
      const st = new THREE.Mesh(stickGeo, stickMat);
      const a = (r * Math.PI) / 2;
      st.position.set(Math.sin(a) * (STICK_Z + 0.12), 0.07, Math.cos(a) * (STICK_Z + 0.12));
      st.rotation.y = a;
      st.castShadow = true;
      st.visible = false;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ color: '#d92b3a' }));
      dot.rotation.x = -Math.PI / 2;
      dot.position.y = 0.07;
      st.add(dot);
      this.scene.add(st);
      this.sticks.push(st);
    }
  }

  /** 相対位置（0=自分 1=右 2=対面 3=左）。3人麻雀は 0,1,3 を使う。 */
  rel(seat: number): number {
    const d = (seat - this.mySeat + this.n) % this.n;
    if (this.n === 3) return [0, 1, 3][d];
    return d;
  }

  private drawCenter() {
    const v = this.view;
    const ctx = this.centerCanvas.getContext('2d')!;
    const S = 1024;
    ctx.clearRect(0, 0, S, S);
    const bg = ctx.createLinearGradient(0, 0, S, S);
    bg.addColorStop(0, '#0d1217');
    bg.addColorStop(1, '#161d25');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(231,194,106,0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, S - 28, S - 28);
    if (!v) { this.centerTex.needsUpdate = true; return; }
    const winds = ['東', '南', '西', '北'];
    const nums = ['一', '二', '三', '四'];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f6e3a8';
    ctx.font = '800 150px "Shippori Mincho B1", "Hiragino Mincho ProN", serif';
    ctx.fillText(`${winds[v.roundWind] ?? ''}${nums[v.kyoku] ?? ''}局`, S / 2, S / 2 - 60);
    ctx.font = '700 62px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
    ctx.fillStyle = '#9fb3c4';
    ctx.fillText(`残り ${v.left}`, S / 2, S / 2 + 62);
    ctx.font = '700 46px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
    ctx.fillStyle = '#c9d6e0';
    ctx.fillText(`${v.honba} 本場   供託 ${v.kyotaku}`, S / 2, S / 2 + 136);
    for (const p of v.players) {
      const r = this.rel(p.seat);
      ctx.save();
      ctx.translate(S / 2, S / 2);
      // テクスチャは上から見て貼るので、席の向きに合わせて回す
      ctx.rotate((-r * Math.PI) / 2);
      const active = v.phase !== 'end' && v.turn === p.seat;
      ctx.fillStyle = p.seat === v.dealer ? '#e2495b' : '#2a3540';
      const bw = 120;
      ctx.beginPath();
      ctx.roundRect(-330, 352, bw, 108, 20);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '800 82px "Shippori Mincho B1", "Hiragino Mincho ProN", serif';
      ctx.fillText(winds[p.wind - 27], -330 + bw / 2, 410);
      ctx.fillStyle = active ? '#ffd76a' : '#eef3f7';
      ctx.font = '700 104px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(p.score), -180, 410);
      ctx.restore();
      ctx.textAlign = 'center';
    }
    this.centerTex.needsUpdate = true;
  }

  // ---- 配置 ----

  private seatQuat(r: number): THREE.Quaternion {
    return new THREE.Quaternion().setFromAxisAngle(Y_AXIS, (r * Math.PI) / 2);
  }

  private place(r: number, x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).applyAxisAngle(Y_AXIS, (r * Math.PI) / 2);
  }

  private layout(view: RoundView): Placement[] {
    const out: Placement[] = [];
    for (const p of view.players) {
      const r = this.rel(p.seat);
      const sq = this.seatQuat(r);
      const lying = sq.clone().multiply(Q_LYING);
      const lyingSide = lying.clone().multiply(Q_SIDE);
      const faceDown = sq.clone().multiply(Q_FACEDOWN);
      const mine = p.seat === this.mySeat && p.hand !== undefined;
      const revealed = this.reveals.get(p.seat);

      // --- 副露（右端から左へ）---
      // 自分の副露は右端いっぱい、他家は角を空ける（角で隣の手牌と重ならないように）
      const meldStart = p.seat === this.mySeat ? HALF - 0.75 : HALF - 2.0;
      let mx = meldStart;
      const meldPlacements: Placement[] = [];
      for (const m of p.melds) {
        const list = this.meldSlots(m, p.seat);
        let width = 0;
        for (const s of list) width += s.side ? TH : TW;
        let x = mx - width;
        for (const s of list) {
          const w = s.side ? TH : TW;
          const cx = x + w / 2;
          const q = s.down ? faceDown : s.side ? lyingSide : lying;
          const zz = MELD_Z + (s.side ? (TH - TW) / 2 : 0) - (s.stack ? TW : 0);
          meldPlacements.push({ key: `t${s.tile}`, tile: s.down ? null : s.tile, pos: this.place(r, cx, TT / 2, zz), quat: q, shadow: true });
          if (!s.stack) x += w;
        }
        mx -= width + 0.22;
      }
      out.push(...meldPlacements);

      // --- 抜きドラ（左端から右へ）---
      p.nuki.forEach((t, i) => {
        out.push({ key: `t${t}`, tile: t, pos: this.place(r, -HALF + 0.75 + i * TW, TT / 2, MELD_Z), quat: lying, shadow: true });
      });

      // --- 手牌 ---
      const meldSpace = meldStart - mx; // 副露が使った幅
      const nukiSpace = p.nuki.length ? p.nuki.length * TW + 0.35 : 0; // 抜きドラが使った幅（左端）
      if (mine) {
        const hand = p.hand!;
        const scale = Math.max(0.9, Math.min(1.12, (HALF * 2 - 2.3 - meldSpace - nukiSpace) / (hand.length + (p.drawn != null ? 1.35 : 0))));
        const SW = TW * scale;
        const total = hand.length * SW + (p.drawn != null ? SW * 1.35 : 0);
        const avail = HALF * 2 - 1.5 - meldSpace;
        let x0 = -total / 2 - meldSpace / 2 + nukiSpace / 2;
        if (x0 < -HALF + 0.75 + nukiSpace) x0 = -HALF + 0.75 + nukiSpace;
        void avail;
        const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.92, 0, 0));
        const q = sq.clone().multiply(tilt);
        hand.forEach((t, i) => {
          out.push({ key: `t${t}`, tile: t, pos: this.place(r, x0 + (i + 0.5) * SW, 0.78, MY_HAND_Z), quat: q, mine: true, shadow: true, scale });
        });
        if (p.drawn != null) {
          out.push({
            key: `t${p.drawn}`, tile: p.drawn, pos: this.place(r, x0 + hand.length * SW + SW * 0.85, 0.78, MY_HAND_Z), quat: q, mine: true, shadow: true, scale,
            spawn: { pos: this.place(r, x0 + hand.length * SW + SW * 0.85, TH / 2 + 1.6, MY_HAND_Z - 1.2), quat: q },
          });
        }
      } else if (revealed) {
        // 和了・流局で公開された手牌: 表向きに倒して見せる
        const total = revealed.length * TW;
        const x0 = -total / 2 - meldSpace / 2 + nukiSpace / 2;
        revealed.forEach((t, i) => {
          out.push({ key: `t${t}`, tile: t, pos: this.place(r, x0 + (i + 0.5) * TW, TT / 2, HAND_Z), quat: lying, shadow: true, spawn: this.objs.get(`h${p.seat}_${i}`) ? { pos: this.objs.get(`h${p.seat}_${i}`)!.base.clone(), quat: sq.clone() } : undefined });
        });
      } else {
        const count = p.handCount;
        const total = count * TW + (p.hasDrawn ? TW * 1.35 : 0);
        const x0 = -total / 2 - meldSpace / 2 + nukiSpace / 2;
        for (let i = 0; i < count; i++) {
          out.push({ key: `h${p.seat}_${i}`, tile: null, pos: this.place(r, x0 + (i + 0.5) * TW, TH / 2, HAND_Z), quat: sq, shadow: true });
        }
        if (p.hasDrawn) {
          const pos = this.place(r, x0 + count * TW + TW * 0.85, TH / 2, HAND_Z);
          out.push({ key: `d${p.seat}`, tile: null, pos, quat: sq, shadow: true, spawn: { pos: pos.clone().add(new THREE.Vector3(0, 1.4, 0)), quat: sq } });
        }
      }

      // --- 河 ---
      let col = 0, row = 0, x = -3 * TW;
      const drawnObj = this.objs.get(`d${p.seat}`);
      const handMid = this.place(r, 0, TH / 2, p.seat === this.mySeat ? MY_HAND_Z : HAND_Z);
      for (const rv of p.river) {
        if (rv.calledBy !== undefined) continue;
        if (col >= 6 && row < 2) { col = 0; row++; x = -3 * TW; }
        const w = rv.riichi ? TH : TW;
        const pos = this.place(r, x + w / 2, TT / 2, RIVER_Z0 + row * (TH + 0.04) + (rv.riichi ? (TH - TW) / 2 : 0));
        out.push({
          key: `t${rv.tile}`, tile: rv.tile, pos, quat: rv.riichi ? lyingSide : lying, shadow: true, arc: 1.1,
          spawn: { pos: rv.tsumogiri && drawnObj ? drawnObj.base.clone() : handMid, quat: sq },
        });
        x += w;
        col++;
      }
    }
    return out;
  }

  /** 副露の並び。鳴いた牌は横向き。誰から鳴いたかで横向きの位置が変わる。 */
  private meldSlots(m: Meld, seat: number): { tile: Tile; side?: boolean; down?: boolean; stack?: boolean }[] {
    if (m.type === 'ankan') {
      const t = m.tiles;
      return [{ tile: t[0], down: true }, { tile: t[1] }, { tile: t[2] }, { tile: t[3], down: true }];
    }
    const called = m.called!;
    const own = m.tiles.filter((t) => t !== called && t !== m.added);
    const d = ((m.from ?? 0) - seat + this.n) % this.n; // 1=下家 2=対面 3=上家（4人）
    const relFrom = this.n === 3 ? (d === 1 ? 1 : 3) : d;
    const idx = relFrom === 3 ? 0 : relFrom === 2 ? 1 : own.length;
    const list: { tile: Tile; side?: boolean; down?: boolean; stack?: boolean }[] = own.map((t) => ({ tile: t }));
    list.splice(idx, 0, { tile: called, side: true });
    if (m.added !== undefined) {
      const i = list.findIndex((s) => s.side);
      list.splice(i, 0, { tile: m.added, side: true, stack: true });
    }
    return list;
  }

  // ---- 外から呼ぶ ----

  setTheme(theme: SceneTheme) {
    this.theme = theme;
    (this.felt.material as THREE.MeshStandardMaterial).map = this.feltTexture();
    (this.felt.material as THREE.MeshStandardMaterial).needsUpdate = true;
  }

  /** 公開された手牌（和了・流局）。null で全消去 */
  setReveal(seat: number | null, tiles?: Tile[]) {
    if (seat === null) this.reveals.clear();
    else if (tiles) this.reveals.set(seat, tiles);
  }

  /** 盤面を反映する。animate=false なら瞬時に並べる（再接続時など）。 */
  setView(view: RoundView, mySeat: number, animate = true, stagger = 0) {
    this.view = view;
    this.mySeat = mySeat < 0 ? 0 : mySeat;
    this.n = view.n;
    this.doraKinds = new Set(view.dora.map((t) => doraFromIndicator(t >> 2, view.n === 3)));
    const now = performance.now();
    const placements = this.layout(view);
    const seen = new Set<string>();
    let order = 0;
    for (const pl of placements) {
      seen.add(pl.key);
      let o = this.objs.get(pl.key);
      const isNew = !o;
      if (!o) {
        o = this.create(pl.key, pl.tile);
        const sp = animate ? pl.spawn : undefined;
        o.group.position.copy(sp ? sp.pos : pl.pos);
        o.group.quaternion.copy(sp ? sp.quat : pl.quat);
        if (animate && !sp && stagger) {
          o.group.position.y += 2.2;
        }
      }
      if (o.tile !== pl.tile) this.setFace(o, pl.tile);
      o.mine = !!pl.mine;
      o.group.scale.setScalar(pl.scale ?? 1);
      o.base.copy(pl.pos);
      const moved = o.group.position.distanceToSquared(pl.pos) > 1e-6 || o.group.quaternion.angleTo(pl.quat) > 1e-3;
      if (!animate) {
        o.group.position.copy(pl.pos);
        o.group.quaternion.copy(pl.quat);
        o.tween = null;
      } else if (moved || o.tween) {
        const dist = o.group.position.distanceTo(pl.pos);
        o.tween = {
          from: o.group.position.clone(), to: pl.pos.clone(),
          qFrom: o.group.quaternion.clone(), qTo: pl.quat.clone(),
          t0: now, dur: isNew && stagger ? 260 : Math.min(340, 150 + dist * 26),
          arc: isNew && pl.spawn ? (pl.arc ?? 0) : dist > 3 ? (pl.arc ?? 0.5) : 0,
          delay: stagger ? (order++ % 14) * stagger + Math.floor(order / 14) * stagger * 2 : 0,
        };
      }
    }
    for (const [key, o] of this.objs) {
      if (!seen.has(key)) {
        this.scene.remove(o.group);
        this.objs.delete(key);
        if (this.hovered === o) this.hovered = null;
      }
    }
    // 立直棒
    for (const st of this.sticks) st.visible = false;
    for (const p of view.players) if (p.riichi > 0) this.sticks[this.rel(p.seat)].visible = true;
    // 最後の捨て牌の目印
    this.marker.visible = false;
    let last: { tile: Tile; seat: number } | null = null;
    if (view.phase !== 'end') {
      const prev = (view.turn - 1 + view.n) % view.n;
      const cand = view.phase === 'claim' ? view.turn : prev;
      const pv = view.players[cand];
      const rv = pv?.river[pv.river.length - 1];
      if (rv && rv.calledBy === undefined) last = { tile: rv.tile, seat: cand };
    }
    if (last) {
      const o = this.objs.get(`t${last.tile}`);
      if (o) { this.marker.visible = true; this.marker.position.copy(o.base).add(new THREE.Vector3(0, 1.0, 0)); }
    }
    this.drawCenter();
    this.applyDim();
  }

  /** 選べる牌を指定する（null なら操作不可）。dimOthers で選べない牌を暗くする。 */
  setSelectable(tiles: Tile[] | null, dimOthers = false) {
    this.selectable = tiles ? new Set(tiles) : null;
    this.interactive = !!tiles;
    this.dimOthers = dimOthers;
    this.applyDim();
    if (!tiles) { this.selected = null; }
  }
  private dimOthers = false;

  setSelected(tile: Tile | null) {
    this.selected = tile;
  }

  private applyDim() {
    for (const o of this.objs.values()) {
      const dim = o.mine && this.dimOthers && this.selectable !== null && o.tile !== null && !this.selectable.has(o.tile);
      const dora = o.tile !== null && (this.doraKinds.has(o.tile >> 2) || isAkaTile(o.tile));
      const mat = dim ? this.bodyDimMat : dora ? this.bodyDoraMat : this.bodyMat;
      if (o.body.material !== mat) o.body.material = mat;
      if (dim !== o.dim) {
        o.dim = dim;
        if (o.face && o.tile !== null) o.face.material = this.faceMat(tileFile(o.tile), dim);
      }
    }
  }

  /** 画面を揺らす（和了・放銃の演出用） */
  impact(strength = 1) {
    this.shake = Math.max(this.shake, strength);
  }

  /** 牌の画面上の位置（演出の起点用）。無ければ null */
  screenPosOfTile(tile: Tile): { x: number; y: number } | null {
    const o = this.objs.get(`t${tile}`);
    if (!o) return null;
    const v = o.base.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  /** 席の手前あたりの画面上の位置（鳴きの吹き出し用） */
  screenPosOfSeat(seat: number): { x: number; y: number } {
    const r = this.rel(seat);
    const v = this.place(r, 0, 1.2, 6.6).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  private create(key: string, tile: Tile | null): TileObj {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const o: TileObj = { key, group, body, face: null, tile: null, tween: null, mine: false, dim: false, lift: 0, base: new THREE.Vector3() };
    group.userData.obj = o;
    this.setFace(o, tile);
    this.scene.add(group);
    this.objs.set(key, o);
    return o;
  }

  private setFace(o: TileObj, tile: Tile | null) {
    o.tile = tile;
    if (tile === null) {
      if (o.face) { o.group.remove(o.face); o.face = null; }
      return;
    }
    if (!o.face) {
      o.face = new THREE.Mesh(this.faceGeo, this.faceMat(tileFile(tile), o.dim));
      o.face.position.z = TT / 2 + 0.004;
      o.group.add(o.face);
    } else {
      o.face.material = this.faceMat(tileFile(tile), o.dim);
    }
  }

  // ---- 入力 ----

  private onMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  private onLeave = () => { this.pointer.set(-9, -9); };
  private onDown = (e: PointerEvent) => {
    this.onMove(e);
    const o = this.pick();
    if (o && o.tile !== null && this.interactive && this.selectable?.has(o.tile)) this.cb.onTile?.(o.tile, e.pointerType !== 'mouse');
  };

  private pick(): TileObj | null {
    if (this.pointer.x < -2) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const o of this.objs.values()) if (o.mine) meshes.push(o.body);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    return hit ? ((hit.object.parent!.userData.obj as TileObj) ?? null) : null;
  }

  // ---- 描画 ----

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // 横幅に卓が収まるよう、縦長・正方形寄りの画面ではカメラを引く
    const k = Math.max(1, 1.72 / aspect);
    this.camBase.set(0, 23.6 * k, 17.2 * k + (k - 1) * 3);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 0, 2.35);
    this.camera.updateProjectionMatrix();
  };

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.clock) / 1000);
    this.clock = now;

    // ホバー
    const h = this.interactive ? this.pick() : null;
    const hv = h && h.tile !== null && this.selectable?.has(h.tile) ? h : null;
    if (hv !== this.hovered) {
      this.hovered = hv;
      this.canvas.style.cursor = hv ? 'pointer' : 'default';
      this.cb.onHover?.(hv?.tile ?? null);
    }

    for (const o of this.objs.values()) {
      if (o.tween) {
        const tw = o.tween;
        const x = (now - tw.t0 - tw.delay) / tw.dur;
        if (x >= 1) {
          o.group.position.copy(tw.to);
          o.group.quaternion.copy(tw.qTo);
          o.tween = null;
        } else if (x > 0) {
          const e = easeOut(x);
          o.group.position.lerpVectors(tw.from, tw.to, e);
          o.group.position.y += Math.sin(Math.PI * x) * tw.arc;
          o.group.quaternion.slerpQuaternions(tw.qFrom, tw.qTo, e);
        }
      } else if (o.mine) {
        const want = o.tile !== null && o.tile === this.selected ? 0.5 : o === this.hovered ? 0.28 : 0;
        o.lift += (want - o.lift) * Math.min(1, dt * 22);
        o.group.position.set(o.base.x, o.base.y + o.lift, o.base.z - o.lift * 0.25);
      }
    }

    // 手番の光
    if (this.view) {
      const pulse = 0.55 + 0.45 * Math.sin(now / 260);
      for (let r = 0; r < 4; r++) (this.turnLights[r].material as THREE.MeshBasicMaterial).opacity = 0;
      if (this.view.phase !== 'end') {
        const r = this.rel(this.view.turn);
        (this.turnLights[r].material as THREE.MeshBasicMaterial).opacity = this.view.phase === 'turn' ? pulse : 0.25;
      }
    }
    this.bodyDoraMat.emissiveIntensity = 0.24 + 0.14 * Math.sin(now / 420);
    if (this.marker.visible) {
      this.marker.position.y = 1.05 + Math.sin(now / 220) * 0.1;
      this.marker.rotation.y += dt * 2.4;
    }

    // 揺れ
    if (this.shake > 0.001) {
      this.camera.position.set(
        this.camBase.x + (Math.random() - 0.5) * this.shake * 0.5,
        this.camBase.y + (Math.random() - 0.5) * this.shake * 0.35,
        this.camBase.z + (Math.random() - 0.5) * this.shake * 0.3,
      );
      this.shake *= Math.pow(0.0015, dt);
    } else if (this.shake !== 0) {
      this.shake = 0;
      this.camera.position.copy(this.camBase);
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.renderer.dispose();
  }
}
