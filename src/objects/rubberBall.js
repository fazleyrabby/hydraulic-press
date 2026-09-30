import * as THREE from 'three';

export default {
  id: 'rubberBall',
  name: 'Rubber Ball',
  description: 'Squishes flat, bounces right back. Nothing to break.',
  material: { behavior: 'elastic', stiffness: 1.8, maxCompression: 0.62 },
  build() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#e23b26'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#ffd23a'; g.fillRect(0, 112, 512, 32);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(3.6, 64, 48),
      new THREE.MeshPhysicalMaterial({ map, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4 })
    );
    ball.rotation.x = 0.35;
    return ball;
  },
};
