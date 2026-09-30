import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export default {
  id: 'tungstenCube',
  name: 'Tungsten Cube',
  description: 'Very dense, yields around 250 t. Needs a big press — or it wins.',
  material: { behavior: 'ductile', yield: 250, hardening: 0.4, densify: 2, maxCompression: 0.45, bulge: 0.45, crumple: 0.03, folds: 1 },
  failMessage: 'Tungsten Cube held — try raising the press capacity above 250 t',
  build() {
    return new THREE.Mesh(
      new RoundedBoxGeometry(5, 5, 5, 8, 0.15),
      new THREE.MeshStandardMaterial({ color: '#8e9196', metalness: 1, roughness: 0.3 })
    );
  },
};
