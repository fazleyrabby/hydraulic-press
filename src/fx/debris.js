import * as THREE from 'three';

const _box = new THREE.Box3();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const G = 981; // cm/s²

/**
 * Tiny rigid-body-ish debris simulator: gravity, spin, bouncy ground contact
 * using each object's world bounding box. Good enough for flying chunks.
 */
export class Debris {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.groundAt = () => 0;
  }

  add(obj, vel, angVel, { bounce = 0.3, friction = 0.6, owned = false } = {}) {
    if (obj.parent !== this.scene) this.scene.attach(obj);
    obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.items.push({ obj, v: vel.clone(), w: angVel.clone(), bounce, friction, sleep: 0, owned });
  }

  update(dt) {
    for (const it of this.items) {
      if (it.sleep > 0.6) continue;
      const { obj, v, w } = it;
      v.y -= G * dt;
      obj.position.addScaledVector(v, dt);
      const speed = w.length();
      if (speed > 1e-4) {
        _q.setFromAxisAngle(_axis.copy(w).divideScalar(speed), speed * dt);
        obj.quaternion.premultiply(_q);
      }
      obj.updateMatrixWorld(true);
      _box.setFromObject(obj);
      const ground = this.groundAt(obj.position.x, obj.position.z);
      if (_box.min.y < ground) {
        obj.position.y += ground - _box.min.y;
        if (v.y < 0) v.y = -v.y * it.bounce;
        v.x *= it.friction; v.z *= it.friction;
        w.multiplyScalar(0.55);
        if (Math.abs(v.y) < 25 && v.lengthSq() < 400) { v.set(0, 0, 0); w.multiplyScalar(0.2); }
      }
      it.sleep = v.lengthSq() < 1 && w.lengthSq() < 0.01 ? it.sleep + dt : 0;
    }
  }

  clear() {
    for (const it of this.items) {
      it.obj.removeFromParent();
      if (it.owned) it.obj.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    this.items.length = 0;
  }
}
