import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export default {
  id: 'glassCube',
  name: 'Glass Cube',
  description: 'Hard but brittle. Holds until ~6 t, then explodes into shards.',
  material: { behavior: 'brittle', strength: 6, breakStrain: 0.015, fragments: 60, fragmentShape: 'shard', dustColor: [0.9, 0.95, 1] },
  build() {
    return new THREE.Mesh(
      new RoundedBoxGeometry(5.5, 5.5, 5.5, 4, 0.25),
      new THREE.MeshPhysicalMaterial({
        color: '#e6f6ff', roughness: 0.03, metalness: 0, transmission: 1, thickness: 3, ior: 1.52,
        attenuationColor: '#bfe8e0', attenuationDistance: 12, clearcoat: 1, specularIntensity: 1,
      })
    );
  },
};
