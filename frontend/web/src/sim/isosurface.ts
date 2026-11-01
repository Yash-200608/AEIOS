// Isosurface extraction for a scalar field on a regular (not necessarily cubic) grid, using the classic marching-cubes tables that
// ship with three.js. three's own MarchingCubes object needs a cubic grid; the dispersion box is 64 x 64 x 16.
import { edgeTable as edgeTableTyped, triTable as triTableTyped } from 'three/examples/jsm/objects/MarchingCubes.js';

// @types/three declares these as arrays of typed arrays; at runtime they are flat Int32Arrays (256 and 256 x 16 entries).
const edgeTable = edgeTableTyped as unknown as Int32Array;
const triTable = triTableTyped as unknown as Int32Array;

export type Mesh = { positions: Float32Array; normals: Float32Array };

// Cube corners (x, y, z offsets) and the two corners each of the 12 edges joins, as in Bourke's formulation that the tables use.
const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const EDGE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * Triangles of the surface where field == iso. Cells are sx x sy x sz in world units, the field sample (i, j, k) sits at
 * ((i + 0.5) sx, (j + 0.5) sy, (k + 0.5) sz). Normals point toward LOWER field values (out of a plume), from the field gradient.
 * `field` is indexed (k * ny + j) * nx + i.
 */
export function isosurface(field: Float32Array, nx: number, ny: number, nz: number, iso: number, sx = 1, sy = 1, sz = 1): Mesh {
  const pos: number[] = [], nor: number[] = [];
  const at = (i: number, j: number, k: number) => field[(k * ny + j) * nx + i];
  const grad = (i: number, j: number, k: number): [number, number, number] => {
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(ny - 1, j + 1), k0 = Math.max(0, k - 1), k1 = Math.min(nz - 1, k + 1);
    return [(at(i1, j, k) - at(i0, j, k)) / ((i1 - i0) * sx), (at(i, j1, k) - at(i, j0, k)) / ((j1 - j0) * sy), (at(i, j, k1) - at(i, j, k0)) / ((k1 - k0) * sz)];
  };
  const vp = new Float64Array(36), vn = new Float64Array(36), val = new Float64Array(8);
  for (let k = 0; k < nz - 1; k += 1) for (let j = 0; j < ny - 1; j += 1) for (let i = 0; i < nx - 1; i += 1) {
    let cube = 0;
    for (let c = 0; c < 8; c += 1) {
      val[c] = at(i + CORNER[c][0], j + CORNER[c][1], k + CORNER[c][2]);
      if (val[c] < iso) cube |= 1 << c;
    }
    const edges = edgeTable[cube];
    if (edges === 0) continue;
    for (let e = 0; e < 12; e += 1) {
      if (!(edges & (1 << e))) continue;
      const [a, b] = EDGE[e];
      const va = val[a], vb = val[b];
      const t = vb === va ? 0.5 : Math.min(1, Math.max(0, (iso - va) / (vb - va)));
      const ca = CORNER[a], cb = CORNER[b];
      vp[e * 3] = (i + ca[0] + (cb[0] - ca[0]) * t + 0.5) * sx;
      vp[e * 3 + 1] = (j + ca[1] + (cb[1] - ca[1]) * t + 0.5) * sy;
      vp[e * 3 + 2] = (k + ca[2] + (cb[2] - ca[2]) * t + 0.5) * sz;
      const ga = grad(i + ca[0], j + ca[1], k + ca[2]), gb = grad(i + cb[0], j + cb[1], k + cb[2]);
      let nxv = -(ga[0] + (gb[0] - ga[0]) * t), nyv = -(ga[1] + (gb[1] - ga[1]) * t), nzv = -(ga[2] + (gb[2] - ga[2]) * t);
      const len = Math.hypot(nxv, nyv, nzv) || 1;
      nxv /= len; nyv /= len; nzv /= len;
      vn[e * 3] = nxv; vn[e * 3 + 1] = nyv; vn[e * 3 + 2] = nzv;
    }
    for (let t = cube * 16; triTable[t] !== -1 && t < cube * 16 + 15; t += 3) {
      for (let v = 0; v < 3; v += 1) {
        const e = triTable[t + v];
        pos.push(vp[e * 3], vp[e * 3 + 1], vp[e * 3 + 2]);
        nor.push(vn[e * 3], vn[e * 3 + 1], vn[e * 3 + 2]);
      }
    }
  }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor) };
}

/** Total triangle area of a mesh (used to check the extraction). */
export function meshArea(m: Mesh): number {
  let a = 0;
  const p = m.positions;
  for (let t = 0; t < p.length; t += 9) {
    const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
    const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
    a += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  return a;
}
