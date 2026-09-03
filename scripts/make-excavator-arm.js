/**
 * Builds public/models/excavator-arm.glb — a small three-material test model.
 *
 * The catalogue's only real GLB (robotic-hand) carries ONE material, so nothing
 * shipped could exercise a material-slot switcher. This is the fixture: three
 * boxes, three named materials, ~2KB, so "Element 0 / 1 / 2" is a thing you can
 * actually click in the editor.
 *
 * The .glb it writes is checked in — this exists so that binary has a source.
 * Run it from the repo root:  node scripts/make-excavator-arm.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The package is `"type": "module"`, so this is ESM and has no __dirname.
const here = path.dirname(fileURLToPath(import.meta.url));

// ---- one unit box, shared by all three parts -----------------------------
// 24 verts (4 per face, so each face gets its own normal), 36 indices.
const faces = [
  { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
];

const positions = [];
const normals = [];
const indices = [];
faces.forEach((f, fi) => {
  f.v.forEach((v) => {
    positions.push(v[0] * 0.5, v[1] * 0.5, v[2] * 0.5);
    normals.push(...f.n);
  });
  const b = fi * 4;
  indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
});

const posBuf = Buffer.from(new Float32Array(positions).buffer);
const nrmBuf = Buffer.from(new Float32Array(normals).buffer);
const idxBuf = Buffer.from(new Uint16Array(indices).buffer);
const pad4 = (b) => (b.length % 4 === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]));
const bin = Buffer.concat([posBuf, nrmBuf, pad4(idxBuf)]);

const min = [-0.5, -0.5, -0.5];
const max = [0.5, 0.5, 0.5];

// ---- the three parts ------------------------------------------------------
const parts = [
  {
    name: "Body",
    material: "Body",
    translation: [0, 0.3, 0],
    scale: [0.62, 0.34, 1.05],
    pbr: { baseColorFactor: [0.788, 0.541, 0.353, 1], metallicFactor: 0.1, roughnessFactor: 0.8 },
  },
  {
    name: "Hydraulics",
    material: "Hydraulics",
    translation: [0.26, 0.74, -0.12],
    scale: [0.13, 0.6, 0.13],
    pbr: { baseColorFactor: [0.604, 0.584, 0.561, 1], metallicFactor: 0.9, roughnessFactor: 0.25 },
  },
  {
    name: "Cab Glass",
    material: "Cab Glass",
    translation: [-0.02, 0.78, 0.3],
    scale: [0.4, 0.3, 0.36],
    pbr: { baseColorFactor: [0.184, 0.435, 0.478, 1], metallicFactor: 0.0, roughnessFactor: 0.05 },
  },
];

const gltf = {
  asset: { version: "2.0", generator: "terra-material-slot-fixture" },
  scene: 0,
  scenes: [{ name: "Scene", nodes: parts.map((_, i) => i) }],
  nodes: parts.map((p, i) => ({
    name: p.name,
    mesh: i,
    translation: p.translation,
    scale: p.scale,
  })),
  meshes: parts.map((p, i) => ({
    name: p.name,
    primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: i }],
  })),
  materials: parts.map((p) => ({
    name: p.material,
    pbrMetallicRoughness: p.pbr,
    doubleSided: false,
  })),
  accessors: [
    { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max },
    { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
    { bufferView: 2, componentType: 5123, count: indices.length, type: "SCALAR" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
    { buffer: 0, byteOffset: posBuf.length, byteLength: nrmBuf.length, target: 34962 },
    { buffer: 0, byteOffset: posBuf.length + nrmBuf.length, byteLength: idxBuf.length, target: 34963 },
  ],
  buffers: [{ byteLength: bin.length }],
};

// ---- pack to GLB ----------------------------------------------------------
// The glTF spec pads the JSON chunk with SPACES and the BIN chunk with zeros.
// Zero-padding the JSON leaves NUL bytes inside the string GLTFLoader hands to
// JSON.parse, which throws — the file loads nowhere.
const jsonRaw = Buffer.from(JSON.stringify(gltf), "utf8");
const jsonPad = jsonRaw.length % 4 === 0 ? 0 : 4 - (jsonRaw.length % 4);
const jsonBuf = Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // "glTF"
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);

const chunk = (data, type) => {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(data.length, 0);
  h.writeUInt32LE(type, 4);
  return Buffer.concat([h, data]);
};

const out = Buffer.concat([
  header,
  chunk(jsonBuf, 0x4e4f534a), // JSON
  chunk(bin, 0x004e4942), // BIN
]);

const dest = path.join(here, "..", "public/models/excavator-arm.glb");
fs.writeFileSync(dest, out);
console.log("wrote", dest, out.length, "bytes ·", gltf.materials.map((m) => m.name).join(" / "));
