import * as THREE from 'three';

function labelTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#c3122b';
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, 330);
  for (let x = 0; x <= 1024; x += 8) g.lineTo(x, 330 + Math.sin((x / 1024) * Math.PI * 4) * 30);
  g.lineTo(1024, 380);
  for (let x = 1024; x >= 0; x -= 8) g.lineTo(x, 372 + Math.sin((x / 1024) * Math.PI * 4 + 0.6) * 26);
  g.fill();
  g.font = 'italic 900 170px Georgia, serif';
  g.textBaseline = 'middle';
  for (const x of [80, 592]) g.fillText('Fizz', x, 200);
  g.font = 'bold 34px Arial';
  for (const x of [120, 632]) g.fillText('ORIGINAL · 330 ml', x, 450);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export default {
  id: 'sodaCan',
  name: 'Soda Can',
  description: 'Thin aluminium. Yields almost instantly and crumples.',
  material: { behavior: 'ductile', yield: 0.12, hardening: 1.2, densify: 30, maxCompression: 0.84, bulge: 0.3, crumple: 0.35, folds: 6 },
  build() {
    const g = new THREE.Group();
    const R = 3.3;
    const alu = new THREE.MeshStandardMaterial({ color: '#d4d7dc', metalness: 1, roughness: 0.25 });
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, 9.8, 64, 40, true),
      new THREE.MeshStandardMaterial({ map: labelTexture(), metalness: 0.55, roughness: 0.3 })
    );
    body.position.y = 0.9 + 4.9;
    g.add(body);
    const bottom = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0, 0.55), new THREE.Vector2(1.6, 0.3), new THREE.Vector2(2.5, 0.0),
      new THREE.Vector2(3.0, 0.2), new THREE.Vector2(3.3, 0.9),
    ], 64), alu);
    const top = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(R, 10.7), new THREE.Vector2(3.1, 11.4), new THREE.Vector2(2.7, 11.95),
      new THREE.Vector2(2.72, 12.15), new THREE.Vector2(2.55, 12.2), new THREE.Vector2(2.45, 11.95), new THREE.Vector2(0, 11.9),
    ], 64), alu);
    bottom.material = alu.clone();
    bottom.material.side = THREE.DoubleSide;
    top.material = bottom.material;
    g.add(bottom, top);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.6), alu);
    tab.position.set(0, 11.97, 0.7);
    g.add(tab);
    return g;
  },
};
