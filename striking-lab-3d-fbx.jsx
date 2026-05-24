import { useState, useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

/* ═══════════════════════════════════════════════════════════
   STRIKE & COMBO DATA
   ═══════════════════════════════════════════════════════════ */
const STRIKES = {
  clinch_knee: { label: "Clinch Knee", short: "Clinch Knee", type: "knee", target: "body", power: 7, speed: 5, color: "#B10DC9", side: "lead" },
  cross: { label: "Cross", short: "Cross", type: "punch", target: "head", power: 7, speed: 7, color: "#FF6B35", side: "rear" },
  double_leg: { label: "Double Leg", short: "Double Leg", type: "grapple", target: "legs", power: 8, speed: 4, color: "#00A86B", side: "neutral" },
  jab: { label: "Jab", short: "Jab", type: "punch", target: "head", power: 2, speed: 9, color: "#FF4136", side: "lead" },
  jab_cross: { label: "Jab Cross", short: "Jab Cross", type: "combo", target: "head", power: 6, speed: 7, color: "#FF8C42", side: "switch" },
  lead_elbow: { label: "Lead Elbow", short: "Lead Elbow", type: "elbow", target: "head", power: 9, speed: 6, color: "#E8175D", side: "lead" },
  lead_elbow_uppercut_combo: { label: "Elbow Combo", short: "Elbow Combo", type: "combo", target: "head", power: 9, speed: 5, color: "#FF8C42", side: "switch" },
  lead_hook: { label: "Lead Hook", short: "Lead Hook", type: "punch", target: "head", power: 6, speed: 6, color: "#FF4136", side: "lead" },
  lead_kick: { label: "Lead Kick", short: "Lead Kick", type: "kick", target: "legs", power: 5, speed: 6, color: "#00D4FF", side: "lead" },
  lead_uppercut: { label: "Lead Uppercut", short: "Lead Uppercut", type: "punch", target: "body", power: 6, speed: 5, color: "#FF4136", side: "lead" },
  leg_kick: { label: "Low Kick", short: "Low Kick", type: "kick", target: "legs", power: 7, speed: 5, color: "#0074D9", side: "rear" },
  rear_elbow: { label: "Rear Elbow", short: "Rear Elbow", type: "elbow", target: "head", power: 9, speed: 5, color: "#E8175D", side: "rear" },
  rear_body_kick: { label: "Body Kick", short: "Body Kick", type: "kick", target: "body", power: 8, speed: 4, color: "#0074D9", side: "rear" },
  rear_body_uppercut: { label: "Body Uppercut", short: "Body Uppercut", type: "punch", target: "body", power: 8, speed: 4, color: "#FF6B35", side: "rear" },
  rear_hook: { label: "Rear Hook", short: "Rear Hook", type: "punch", target: "head", power: 8, speed: 5, color: "#FF6B35", side: "rear" },
  rear_knee: { label: "Rear Knee", short: "Rear Knee", type: "knee", target: "body", power: 9, speed: 4, color: "#B10DC9", side: "rear" },
  roundhouse_head_kick: { label: "Head Kick", short: "Head Kick", type: "kick", target: "head", power: 10, speed: 3, color: "#0074D9", side: "rear" },
  single_leg: { label: "Single Leg", short: "Single Leg", type: "grapple", target: "legs", power: 7, speed: 5, color: "#00A86B", side: "lead" },
  teep: { label: "Teep", short: "Teep", type: "kick", target: "body", power: 3, speed: 7, color: "#00D4FF", side: "lead" },
};

const CLASSIC_COMBOS = [
  { name: "Boxing 2", keys: ["jab", "cross"], desc: "Classic one-two" },
  { name: "Hands Low", keys: ["jab", "cross", "lead_hook", "leg_kick"], desc: "Hands into low kick" },
  { name: "Elbow Chain", keys: ["lead_elbow", "lead_elbow_uppercut_combo"], desc: "Close-range elbows" },
  { name: "Kick Ladder", keys: ["teep", "lead_kick", "rear_body_kick", "roundhouse_head_kick"], desc: "Body to head kicks" },
  { name: "Knee Entry", keys: ["jab", "cross", "clinch_knee", "rear_knee"], desc: "Boxing into knees" },
  { name: "Takedown", keys: ["jab_cross", "single_leg", "double_leg"], desc: "Leg attack sequence" },
];

const FBX_LOADER = FBXLoader;
const FBX_IDLE_FILE = "idle_stance_midguard.fbx";
const FBX_STRIKE_FILES = Object.keys(STRIKES).reduce((acc, key) => {
  acc[key] = `${key}.fbx`;
  return acc;
}, {});

const getComboRating = (combo) => {
  if (!combo.length) return { power: 0, speed: 0, flow: 0, label: "—" };
  const avgP = combo.reduce((s, k) => s + STRIKES[k].power, 0) / combo.length;
  const avgS = combo.reduce((s, k) => s + STRIKES[k].speed, 0) / combo.length;
  let flow = 5;
  for (let i = 1; i < combo.length; i++) {
    const p = STRIKES[combo[i - 1]], c = STRIKES[combo[i]];
    if (p.side !== c.side) flow += 1.2; else flow -= 0.5;
    if (p.type !== c.type) flow += 0.8;
    if (p.target !== c.target) flow += 0.6;
  }
  flow = Math.min(10, Math.max(1, flow));
  const o = avgP * 0.35 + avgS * 0.3 + flow * 0.35;
  const label = o >= 8 ? "Devastating" : o >= 6.5 ? "Sharp" : o >= 5 ? "Solid" : o >= 3.5 ? "Developing" : "Basic";
  return { power: avgP, speed: avgS, flow, label };
};

/* ═══════════════════════════════════════════════════════════
   3D FIGHTER — SKELETON BUILDER
   ═══════════════════════════════════════════════════════════ */
function buildFighter() {
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: 0xbf8a60, roughness: 0.58, metalness: 0.0, clearcoat: 0.12, clearcoatRoughness: 0.7
  });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0xc31600, roughness: 0.3, metalness: 0.08 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.84, metalness: 0.05 });
  const shortsBandMat = new THREE.MeshStandardMaterial({ color: 0xc31600, roughness: 0.45, metalness: 0.08 });
  const wrapMat = new THREE.MeshStandardMaterial({ color: 0xd7d4c8, roughness: 0.92, metalness: 0.02 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b1f19, roughness: 0.9, metalness: 0.0 });

  const sph = (r, ws = 20, hs = 16) => new THREE.SphereGeometry(r, ws, hs);
  const cap = (r, h, cs = 8, rs = 16) => new THREE.CapsuleGeometry(r, h, cs, rs);
  const cyl = (rt, rb, h, seg = 18) => new THREE.CylinderGeometry(rt, rb, h, seg);

  const makeGlove = (group) => {
    const main = new THREE.Mesh(sph(0.056, 20, 14), gloveMat);
    main.scale.set(1.05, 1.1, 1.25);
    main.position.z = 0.01;
    group.add(main);

    const knuckle = new THREE.Mesh(sph(0.04, 16, 12), gloveMat);
    knuckle.scale.set(1.0, 0.62, 1.15);
    knuckle.position.set(0, 0.01, 0.065);
    group.add(knuckle);

    const cuff = new THREE.Mesh(cyl(0.032, 0.042, 0.06, 14), gloveMat);
    cuff.position.y = -0.04;
    group.add(cuff);
  };

  const makeFoot = (group) => {
    const ankleWrap = new THREE.Mesh(cyl(0.043, 0.043, 0.05, 14), wrapMat);
    ankleWrap.position.y = 0.015;
    group.add(ankleWrap);

    const instep = new THREE.Mesh(cap(0.03, 0.09, 6, 14), wrapMat);
    instep.rotation.x = Math.PI / 2;
    instep.position.set(0, -0.018, 0.048);
    instep.scale.set(1.06, 0.65, 1.0);
    group.add(instep);

    const toe = new THREE.Mesh(sph(0.028, 14, 10), wrapMat);
    toe.scale.set(1.3, 0.65, 1.0);
    toe.position.set(0, -0.026, 0.105);
    group.add(toe);
  };

  const joints = {};
  const root = new THREE.Group();

  // Hips root
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);
  joints.hips = hips;

  const pelvis = new THREE.Mesh(sph(0.125, 22, 16), skinMat);
  pelvis.scale.set(1.35, 0.86, 1.08);
  pelvis.position.y = -0.005;
  hips.add(pelvis);

  const shortsBody = new THREE.Mesh(cyl(0.18, 0.175, 0.14, 18), shortsMat);
  shortsBody.position.y = -0.01;
  hips.add(shortsBody);

  const waistband = new THREE.Mesh(cyl(0.187, 0.187, 0.03, 18), shortsBandMat);
  waistband.position.y = 0.06;
  hips.add(waistband);

  // Spine and torso
  const spine = new THREE.Group();
  spine.position.y = 0.065;
  hips.add(spine);
  joints.spine = spine;

  const chest = new THREE.Group();
  chest.position.y = 0.05;
  spine.add(chest);
  joints.chest = chest;

  const lowerTorso = new THREE.Mesh(cap(0.11, 0.16, 8, 18), skinMat);
  lowerTorso.position.y = 0.14;
  lowerTorso.scale.set(1.15, 1.0, 1.06);
  chest.add(lowerTorso);

  const upperTorso = new THREE.Mesh(cap(0.12, 0.2, 8, 18), skinMat);
  upperTorso.position.y = 0.33;
  upperTorso.scale.set(1.2, 1.0, 1.03);
  chest.add(upperTorso);

  const clavicle = new THREE.Mesh(cyl(0.16, 0.16, 0.03, 16), skinMat);
  clavicle.position.y = 0.42;
  clavicle.scale.set(1.0, 1.0, 0.55);
  chest.add(clavicle);

  const latL = new THREE.Mesh(sph(0.07, 16, 12), skinMat);
  latL.position.set(-0.11, 0.27, 0.0);
  latL.scale.set(1.0, 1.35, 0.95);
  chest.add(latL);
  const latR = latL.clone();
  latR.position.x = 0.11;
  chest.add(latR);

  // Neck and head
  const neck = new THREE.Group();
  neck.position.y = 0.43;
  chest.add(neck);
  joints.neck = neck;

  const neckMesh = new THREE.Mesh(cap(0.042, 0.058, 6, 14), skinMat);
  neckMesh.position.y = 0.04;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.y = 0.085;
  neck.add(head);
  joints.head = head;

  const cranium = new THREE.Mesh(sph(0.102, 22, 18), skinMat);
  cranium.position.y = 0.12;
  cranium.scale.set(0.86, 1.07, 0.95);
  head.add(cranium);

  const jaw = new THREE.Mesh(sph(0.076, 20, 14), skinMat);
  jaw.position.set(0, 0.055, 0.014);
  jaw.scale.set(0.95, 0.68, 0.82);
  head.add(jaw);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 10), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.12, 0.087);
  head.add(nose);

  const brow = new THREE.Mesh(cyl(0.045, 0.05, 0.03, 12), skinMat);
  brow.rotation.x = Math.PI / 2;
  brow.position.set(0, 0.15, 0.075);
  brow.scale.set(1.55, 0.55, 0.6);
  head.add(brow);

  const earL = new THREE.Mesh(sph(0.018, 12, 10), skinMat);
  earL.position.set(-0.082, 0.12, 0.0);
  earL.scale.set(0.8, 1.25, 0.7);
  head.add(earL);
  const earR = earL.clone();
  earR.position.x = 0.082;
  head.add(earR);

  const hairCap = new THREE.Mesh(sph(0.094, 20, 12), hairMat);
  hairCap.position.set(0, 0.175, 0.0);
  hairCap.scale.set(0.92, 0.55, 0.9);
  head.add(hairCap);

  // Left arm (lead in orthodox)
  const lShoulderPivot = new THREE.Group();
  lShoulderPivot.position.set(-0.19, 0.36, 0);
  chest.add(lShoulderPivot);

  const lUpperArm = new THREE.Group();
  lShoulderPivot.add(lUpperArm);
  joints.lUpperArm = lUpperArm;

  const lDeltoid = new THREE.Mesh(sph(0.06, 18, 14), skinMat);
  lDeltoid.scale.set(1.05, 0.95, 1.1);
  lUpperArm.add(lDeltoid);

  const lUpperArmMesh = new THREE.Mesh(cap(0.044, 0.2, 6, 16), skinMat);
  lUpperArmMesh.position.y = -0.14;
  lUpperArmMesh.scale.set(1.04, 1.0, 0.98);
  lUpperArm.add(lUpperArmMesh);

  const lElbowPivot = new THREE.Group();
  lElbowPivot.position.y = -0.28;
  lUpperArm.add(lElbowPivot);

  const lForearm = new THREE.Group();
  lElbowPivot.add(lForearm);
  joints.lForearm = lForearm;

  const lElbow = new THREE.Mesh(sph(0.036, 14, 10), skinMat);
  lForearm.add(lElbow);

  const lForearmMesh = new THREE.Mesh(cap(0.035, 0.2, 6, 14), skinMat);
  lForearmMesh.position.y = -0.12;
  lForearmMesh.scale.set(1.0, 1.0, 0.92);
  lForearm.add(lForearmMesh);

  const lHand = new THREE.Group();
  lHand.position.y = -0.25;
  lForearm.add(lHand);
  joints.lHand = lHand;

  const lWristWrap = new THREE.Mesh(cyl(0.028, 0.032, 0.045, 12), wrapMat);
  lWristWrap.position.y = -0.02;
  lHand.add(lWristWrap);
  makeGlove(lHand);

  // Right arm (rear in orthodox)
  const rShoulderPivot = new THREE.Group();
  rShoulderPivot.position.set(0.19, 0.36, 0);
  chest.add(rShoulderPivot);

  const rUpperArm = new THREE.Group();
  rShoulderPivot.add(rUpperArm);
  joints.rUpperArm = rUpperArm;

  const rDeltoid = new THREE.Mesh(sph(0.06, 18, 14), skinMat);
  rDeltoid.scale.set(1.05, 0.95, 1.1);
  rUpperArm.add(rDeltoid);

  const rUpperArmMesh = new THREE.Mesh(cap(0.044, 0.2, 6, 16), skinMat);
  rUpperArmMesh.position.y = -0.14;
  rUpperArmMesh.scale.set(1.04, 1.0, 0.98);
  rUpperArm.add(rUpperArmMesh);

  const rElbowPivot = new THREE.Group();
  rElbowPivot.position.y = -0.28;
  rUpperArm.add(rElbowPivot);

  const rForearm = new THREE.Group();
  rElbowPivot.add(rForearm);
  joints.rForearm = rForearm;

  const rElbow = new THREE.Mesh(sph(0.036, 14, 10), skinMat);
  rForearm.add(rElbow);

  const rForearmMesh = new THREE.Mesh(cap(0.035, 0.2, 6, 14), skinMat);
  rForearmMesh.position.y = -0.12;
  rForearmMesh.scale.set(1.0, 1.0, 0.92);
  rForearm.add(rForearmMesh);

  const rHand = new THREE.Group();
  rHand.position.y = -0.25;
  rForearm.add(rHand);
  joints.rHand = rHand;

  const rWristWrap = new THREE.Mesh(cyl(0.028, 0.032, 0.045, 12), wrapMat);
  rWristWrap.position.y = -0.02;
  rHand.add(rWristWrap);
  makeGlove(rHand);

  // Left leg (lead)
  const lHipPivot = new THREE.Group();
  lHipPivot.position.set(-0.095, -0.06, 0);
  hips.add(lHipPivot);

  const lUpperLeg = new THREE.Group();
  lHipPivot.add(lUpperLeg);
  joints.lUpperLeg = lUpperLeg;

  const lGlute = new THREE.Mesh(sph(0.068, 16, 12), skinMat);
  lGlute.scale.set(1.06, 0.95, 1.03);
  lUpperLeg.add(lGlute);

  const lUpperLegMesh = new THREE.Mesh(cap(0.064, 0.29, 8, 16), skinMat);
  lUpperLegMesh.position.y = -0.21;
  lUpperLegMesh.scale.set(1.0, 1.0, 0.94);
  lUpperLeg.add(lUpperLegMesh);

  const lShortsLeg = new THREE.Mesh(cyl(0.09, 0.08, 0.17, 16), shortsMat);
  lShortsLeg.position.y = -0.07;
  lUpperLeg.add(lShortsLeg);

  const lKneePivot = new THREE.Group();
  lKneePivot.position.y = -0.42;
  lUpperLeg.add(lKneePivot);

  const lLowerLeg = new THREE.Group();
  lKneePivot.add(lLowerLeg);
  joints.lLowerLeg = lLowerLeg;

  const lKnee = new THREE.Mesh(sph(0.046, 14, 12), skinMat);
  lLowerLeg.add(lKnee);

  const lLowerLegMesh = new THREE.Mesh(cap(0.049, 0.28, 8, 16), skinMat);
  lLowerLegMesh.position.y = -0.2;
  lLowerLegMesh.scale.set(1.0, 1.0, 0.88);
  lLowerLeg.add(lLowerLegMesh);

  const lFoot = new THREE.Group();
  lFoot.position.y = -0.4;
  lLowerLeg.add(lFoot);
  joints.lFoot = lFoot;
  makeFoot(lFoot);

  // Right leg (rear)
  const rHipPivot = new THREE.Group();
  rHipPivot.position.set(0.095, -0.06, 0);
  hips.add(rHipPivot);

  const rUpperLeg = new THREE.Group();
  rHipPivot.add(rUpperLeg);
  joints.rUpperLeg = rUpperLeg;

  const rGlute = new THREE.Mesh(sph(0.068, 16, 12), skinMat);
  rGlute.scale.set(1.06, 0.95, 1.03);
  rUpperLeg.add(rGlute);

  const rUpperLegMesh = new THREE.Mesh(cap(0.064, 0.29, 8, 16), skinMat);
  rUpperLegMesh.position.y = -0.21;
  rUpperLegMesh.scale.set(1.0, 1.0, 0.94);
  rUpperLeg.add(rUpperLegMesh);

  const rShortsLeg = new THREE.Mesh(cyl(0.09, 0.08, 0.17, 16), shortsMat);
  rShortsLeg.position.y = -0.07;
  rUpperLeg.add(rShortsLeg);

  const rKneePivot = new THREE.Group();
  rKneePivot.position.y = -0.42;
  rUpperLeg.add(rKneePivot);

  const rLowerLeg = new THREE.Group();
  rKneePivot.add(rLowerLeg);
  joints.rLowerLeg = rLowerLeg;

  const rKnee = new THREE.Mesh(sph(0.046, 14, 12), skinMat);
  rLowerLeg.add(rKnee);

  const rLowerLegMesh = new THREE.Mesh(cap(0.049, 0.28, 8, 16), skinMat);
  rLowerLegMesh.position.y = -0.2;
  rLowerLegMesh.scale.set(1.0, 1.0, 0.88);
  rLowerLeg.add(rLowerLegMesh);

  const rFoot = new THREE.Group();
  rFoot.position.y = -0.4;
  rLowerLeg.add(rFoot);
  joints.rFoot = rFoot;
  makeFoot(rFoot);

  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return { root, joints };
}

/* ═══════════════════════════════════════════════════════════
   POSE SYSTEM — Joint rotations as [x, y, z] Euler angles
   ═══════════════════════════════════════════════════════════ */
const JOINT_NAMES = ["hips", "spine", "chest", "neck", "head",
  "lUpperArm", "lForearm", "lHand", "rUpperArm", "rForearm", "rHand",
  "lUpperLeg", "lLowerLeg", "lFoot", "rUpperLeg", "rLowerLeg", "rFoot"];

const STANCE = {
  hips:      [0.08, -0.45, 0],
  spine:     [0, 0.2, 0.03],
  chest:     [-0.05, 0.15, 0],
  neck:      [0, 0.1, 0],
  head:      [0, 0.05, 0],
  lUpperArm: [0.2, 0, 0.95],    // raised, slightly forward
  lForearm:  [-2.1, 0, 0],       // bent at elbow, hand up
  lHand:     [0, 0, 0],
  rUpperArm: [0.3, 0, -0.85],
  rForearm:  [-2.3, 0, 0],
  rHand:     [0, 0, 0],
  lUpperLeg: [-0.15, 0, 0.04],
  lLowerLeg: [0.2, 0, 0],
  lFoot:     [0, 0.45, 0],
  rUpperLeg: [-0.12, 0, -0.04],
  rLowerLeg: [0.15, 0, 0],
  rFoot:     [0, -0.45, 0],
};

// Helper: merge pose overrides onto stance
const fullPose = (overrides = {}) => {
  const p = {};
  for (const j of JOINT_NAMES) p[j] = overrides[j] || STANCE[j];
  return p;
};

/* ═══════════════════════════════════════════════════════════
   STRIKE ANIMATIONS
   Each: { duration, keyframes: [{ t: 0-1, ...jointOverrides }] }
   Only joints that differ from stance need to be listed.
   ═══════════════════════════════════════════════════════════ */
const ANIMS = {
  jab: { dur: 0.35, kf: [
    { t: 0 },
    { t: 0.12, hips: [0.08, -0.3, 0], spine: [0, 0.1, 0.03], lUpperArm: [-1.2, 0.3, 0.6], lForearm: [-0.5, 0, 0] },
    { t: 0.3, hips: [0.08, -0.2, 0], lUpperArm: [-1.45, 0.3, 0.5], lForearm: [-0.15, 0, 0] },
    { t: 0.7 },
    { t: 1.0 },
  ]},
  cross: { dur: 0.45, kf: [
    { t: 0 },
    { t: 0.1, hips: [0.08, -0.15, 0.03], spine: [0, -0.1, 0.04] },
    { t: 0.35, hips: [0.1, 0.1, 0.05], spine: [0, -0.2, 0.05], chest: [-0.05, -0.1, 0],
      rUpperArm: [-1.35, -0.3, -0.5], rForearm: [-0.2, 0, 0] },
    { t: 0.65 },
    { t: 1.0 },
  ]},
  leadHook: { dur: 0.45, kf: [
    { t: 0 },
    { t: 0.1, hips: [0.08, -0.55, -0.03] },
    { t: 0.35, hips: [0.1, -0.15, 0.05], spine: [0, 0.05, 0.04],
      lUpperArm: [-0.6, 0.8, 1.0], lForearm: [-1.6, 0, 0] },
    { t: 0.65 },
    { t: 1.0 },
  ]},
  rearHook: { dur: 0.5, kf: [
    { t: 0 },
    { t: 0.1, hips: [0.08, -0.35, 0.03] },
    { t: 0.35, hips: [0.12, 0.1, 0.05], spine: [0, -0.15, 0.05],
      rUpperArm: [-0.5, -0.8, -1.0], rForearm: [-1.6, 0, 0] },
    { t: 0.65 },
    { t: 1.0 },
  ]},
  leadUppercut: { dur: 0.45, kf: [
    { t: 0 },
    { t: 0.1, hips: [0.12, -0.5, -0.05], lUpperArm: [0.4, 0, 0.8], lForearm: [-2.5, 0, 0] },
    { t: 0.35, hips: [0.04, -0.3, 0.04], spine: [-0.08, 0.15, 0],
      lUpperArm: [-0.8, 0.2, 0.7], lForearm: [-2.0, 0, 0] },
    { t: 0.65 },
    { t: 1.0 },
  ]},
  rearUppercut: { dur: 0.5, kf: [
    { t: 0 },
    { t: 0.1, hips: [0.12, -0.4, 0.05], rUpperArm: [0.4, 0, -0.8], rForearm: [-2.5, 0, 0] },
    { t: 0.35, hips: [0.04, -0.1, 0.04], spine: [-0.08, -0.1, 0],
      rUpperArm: [-0.8, -0.2, -0.7], rForearm: [-2.0, 0, 0] },
    { t: 0.65 },
    { t: 1.0 },
  ]},
  leadElbow: { dur: 0.4, kf: [
    { t: 0 },
    { t: 0.1, hips: [0.08, -0.55, -0.03] },
    { t: 0.3, hips: [0.1, -0.15, 0.05], spine: [0, 0.1, 0.04],
      lUpperArm: [-0.8, 0.9, 1.1], lForearm: [-2.6, 0.2, 0] },
    { t: 0.6 },
    { t: 1.0 },
  ]},
  rearElbow: { dur: 0.45, kf: [
    { t: 0 },
    { t: 0.1, hips: [0.08, -0.35, 0.03] },
    { t: 0.3, hips: [0.12, 0.05, 0.05], spine: [0, -0.1, 0.05],
      rUpperArm: [-0.8, -0.9, -1.1], rForearm: [-2.6, -0.2, 0] },
    { t: 0.6 },
    { t: 1.0 },
  ]},
  teep: { dur: 0.55, kf: [
    { t: 0 },
    { t: 0.15, hips: [0.1, -0.45, -0.02], lUpperLeg: [-1.2, 0, 0.04], lLowerLeg: [1.4, 0, 0] },
    { t: 0.4, hips: [0.06, -0.45, -0.03], spine: [-0.1, 0.2, 0],
      lUpperLeg: [-1.4, 0, 0.04], lLowerLeg: [0.2, 0, 0], lFoot: [0, 0.45, 0] },
    { t: 0.7 },
    { t: 1.0 },
  ]},
  leadKick: { dur: 0.5, kf: [
    { t: 0 },
    { t: 0.12, hips: [0.08, -0.35, -0.08], lUpperLeg: [-0.7, 0.3, 0.1], lLowerLeg: [0.9, 0, 0] },
    { t: 0.35, hips: [0.1, -0.2, -0.12], spine: [0, 0.1, 0.08],
      lUpperLeg: [-0.4, 0.6, 0.2], lLowerLeg: [0.15, 0, 0] },
    { t: 0.65 },
    { t: 1.0 },
  ]},
  rearKick: { dur: 0.55, kf: [
    { t: 0 },
    { t: 0.1, hips: [0.1, -0.6, 0.08] },
    { t: 0.15, hips: [0.1, -0.55, 0.12], rUpperLeg: [-0.7, -0.3, -0.1], rLowerLeg: [0.9, 0, 0] },
    { t: 0.4, hips: [0.12, -0.15, 0.15], spine: [0, -0.1, -0.1],
      rUpperLeg: [-0.3, -0.7, -0.2], rLowerLeg: [0.1, 0, 0] },
    { t: 0.7 },
    { t: 1.0 },
  ]},
  rearBodyKick: { dur: 0.6, kf: [
    { t: 0 },
    { t: 0.12, hips: [0.08, -0.55, 0.08], rUpperLeg: [-1.0, -0.2, -0.1], rLowerLeg: [1.2, 0, 0] },
    { t: 0.4, hips: [0.1, -0.05, 0.18], spine: [0.05, -0.15, -0.12],
      rUpperLeg: [-1.1, -0.6, -0.3], rLowerLeg: [0.15, 0, 0],
      lUpperArm: [0.5, 0, 1.2], rUpperArm: [0.5, 0, -1.0] },
    { t: 0.7 },
    { t: 1.0 },
  ]},
  headKick: { dur: 0.7, kf: [
    { t: 0 },
    { t: 0.1, hips: [0.06, -0.55, 0.06], rUpperLeg: [-1.0, -0.1, -0.05], rLowerLeg: [1.3, 0, 0] },
    { t: 0.4, hips: [0.08, 0.1, 0.22], spine: [0.1, -0.2, -0.15],
      rUpperLeg: [-1.6, -0.7, -0.4], rLowerLeg: [0.1, 0, 0],
      lUpperArm: [0.6, 0, 1.3], rUpperArm: [0.6, 0, -1.1] },
    { t: 0.7 },
    { t: 1.0 },
  ]},
  leadKnee: { dur: 0.5, kf: [
    { t: 0 },
    { t: 0.15, hips: [0.06, -0.4, -0.03], lUpperLeg: [-1.4, 0, 0.05], lLowerLeg: [2.0, 0, 0] },
    { t: 0.4, hips: [0.02, -0.35, -0.04], spine: [-0.08, 0.15, 0],
      lUpperLeg: [-1.7, 0.1, 0.05], lLowerLeg: [2.2, 0, 0],
      lUpperArm: [0.4, 0, 0.6], rUpperArm: [0.4, 0, -0.6] },
    { t: 0.7 },
    { t: 1.0 },
  ]},
  rearKnee: { dur: 0.55, kf: [
    { t: 0 },
    { t: 0.15, hips: [0.06, -0.2, 0.03], rUpperLeg: [-1.4, 0, -0.05], rLowerLeg: [2.0, 0, 0] },
    { t: 0.4, hips: [0.02, -0.1, 0.04], spine: [-0.08, -0.1, 0],
      rUpperLeg: [-1.7, -0.1, -0.05], rLowerLeg: [2.2, 0, 0],
      lUpperArm: [0.4, 0, 0.6], rUpperArm: [0.4, 0, -0.6] },
    { t: 0.7 },
    { t: 1.0 },
  ]},
};

/* ═══════════════════════════════════════════════════════════
   ANIMATION ENGINE
   ═══════════════════════════════════════════════════════════ */
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpAngle(a, b, t) {
  return a + (b - a) * t;
}

function getPoseAtTime(anim, t) {
  const kf = anim.kf;
  // Find surrounding keyframes
  let k0 = kf[0], k1 = kf[kf.length - 1];
  for (let i = 0; i < kf.length - 1; i++) {
    if (t >= kf[i].t && t <= kf[i + 1].t) { k0 = kf[i]; k1 = kf[i + 1]; break; }
  }
  const segLen = k1.t - k0.t;
  const local = segLen > 0 ? easeInOut(Math.min(1, (t - k0.t) / segLen)) : 1;

  const pose = {};
  for (const j of JOINT_NAMES) {
    const a = k0[j] || STANCE[j];
    const b = k1[j] || STANCE[j];
    pose[j] = [
      lerpAngle(a[0], b[0], local),
      lerpAngle(a[1], b[1], local),
      lerpAngle(a[2], b[2], local),
    ];
  }
  return pose;
}

function applyPose(joints, pose) {
  for (const j of JOINT_NAMES) {
    if (joints[j] && pose[j]) {
      joints[j].rotation.set(pose[j][0], pose[j][1], pose[j][2]);
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   3D SCENE SETUP
   ═══════════════════════════════════════════════════════════ */
function createScene(canvas, width, height) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.65;
  renderer.setClearColor(0x171a1d);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x171a1d, 0.02);

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);
  camera.position.set(0.85, 1.45, 3.95);
  camera.lookAt(0, 1.0, 0);

  // Lights
  const keyLight = new THREE.SpotLight(0xfff2e0, 3.6, 20, Math.PI / 4, 0.45);
  keyLight.position.set(2.2, 5.1, 3.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.002;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x9eb2df, 1.45);
  fillLight.position.set(-3.5, 3.4, -0.8);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xff5a46, 1.45, 12);
  rimLight.position.set(-2.1, 2.2, -2.5);
  scene.add(rimLight);

  const rimLight2 = new THREE.PointLight(0x4a92ff, 1.1, 12);
  rimLight2.position.set(2.6, 1.2, -2.1);
  scene.add(rimLight2);

  const ambLight = new THREE.AmbientLight(0x4b505c, 1.05);
  scene.add(ambLight);

  // Floor — octagon
  const floorGeo = new THREE.CircleGeometry(2.2, 8);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xd8d7d1, roughness: 0.94, metalness: 0.03
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.0;
  floor.receiveShadow = true;
  scene.add(floor);

  // Octagon lines
  const ringGeo = new THREE.RingGeometry(1.4, 1.42, 8);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xc9c8c1, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  scene.add(ring);

  // Center cross
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xb8b7b0, transparent: true, opacity: 0.45 });
  for (let i = 0; i < 4; i++) {
    const lg = new THREE.PlaneGeometry(0.008, 2.0);
    const lm = new THREE.Mesh(lg, lineMat);
    lm.rotation.x = -Math.PI / 2;
    lm.rotation.z = (i * Math.PI) / 4;
    lm.position.y = 0.003;
    scene.add(lm);
  }

  return { renderer, scene, camera };
}

/* ═══════════════════════════════════════════════════════════
   SMALL UI COMPONENTS
   ═══════════════════════════════════════════════════════════ */
const Bar = ({ label, value, max = 10, color }) => (
  <div style={{ marginBottom: 5 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
      <span style={{ fontSize: 10, color: "#666", fontFamily: "monospace", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 10, color, fontFamily: "monospace" }}>{value.toFixed(1)}</span>
    </div>
    <div style={{ height: 3, background: "#151515", borderRadius: 2 }}>
      <div style={{ width: `${(value / max) * 100}%`, height: "100%", background: color, borderRadius: 2,
        transition: "width 0.3s", boxShadow: `0 0 6px ${color}55` }} />
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function StrikingLab3D() {
  const [combo, setCombo] = useState([]);
  const [stance, setStance] = useState("orthodox");
  const [playing, setPlaying] = useState(false);
  const [activeIdx, setActiveIdx] = useState(null);
  const [category, setCategory] = useState("all");
  const [currentStrikeName, setCurrentStrikeName] = useState("");
  const [sceneError, setSceneError] = useState("");
  const [mocapLoaded, setMocapLoaded] = useState(false);

  const canvasRef = useRef(null);
  const threeRef = useRef(null);
  const animRef = useRef({
    playing: false,
    queue: [],
    currentAnim: null,
    time: 0,
    idleSway: 0,
    usingMocap: false,
    mocapReady: false,
    mocapMixer: null,
    mocapActions: {},
    mocapActive: null,
    mocapIdle: null,
    mocapQueue: [],
    mocapAdvance: null,
  });
  const containerRef = useRef(null);

  // 3D setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = containerRef.current;
    const w = container ? container.clientWidth : 600;
    const h = Math.max(450, Math.min(600, window.innerHeight * 0.65));

    let raf;
    let renderer = null;
    let camera = null;

    const handleResize = () => {
      if (!renderer || !camera) return;
      const nw = container ? container.clientWidth : 600;
      const nh = Math.max(450, Math.min(600, window.innerHeight * 0.65));
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };

    try {
      const sceneState = createScene(canvas, w, h);
      const scene = sceneState.scene;
      renderer = sceneState.renderer;
      camera = sceneState.camera;

      const { root, joints } = buildFighter();
      scene.add(root);
      applyPose(joints, STANCE);

      threeRef.current = { renderer, scene, camera, joints, root };
      setSceneError("");

      const loadMocap = async () => {
        if (!FBX_LOADER) return;
        const loader = new FBX_LOADER();
        const loadFBX = (url) => new Promise((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        });

        const a = animRef.current;
        const mocapRoot = await loadFBX(`./fbx_files/${FBX_IDLE_FILE}`);
        mocapRoot.scale.setScalar(0.01);
        mocapRoot.position.set(0, 0, 0);
        mocapRoot.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(mocapRoot);
        root.visible = false;
        if (threeRef.current) threeRef.current.mocapRoot = mocapRoot;

        const mixer = new THREE.AnimationMixer(mocapRoot);
        const actions = {};
        for (const key of Object.keys(FBX_STRIKE_FILES)) {
          const file = FBX_STRIKE_FILES[key];
          try {
            const animFBX = await loadFBX(`./fbx_files/${file}`);
            const clip = animFBX.animations && animFBX.animations[0];
            if (!clip) continue;
            const action = mixer.clipAction(clip);
            action.enabled = true;
            action.clampWhenFinished = true;
            action.setLoop(THREE.LoopOnce, 1);
            actions[key] = action;
          } catch {
            // Keep fallback animation system available when a clip is missing.
          }
        }

        let idleAction = null;
        if (mocapRoot.animations && mocapRoot.animations[0]) {
          idleAction = mixer.clipAction(mocapRoot.animations[0]);
          idleAction.setLoop(THREE.LoopRepeat, Infinity);
          idleAction.enabled = true;
          idleAction.play();
        }

        const playMocapStrike = (key, index) => {
          const action = actions[key];
          if (!action) return false;
          const current = a.mocapActive;
          action.reset();
          action.setEffectiveTimeScale(1);
          action.setEffectiveWeight(1);
          action.clampWhenFinished = true;
          action.setLoop(THREE.LoopOnce, 1);

          if (current && current !== action) {
            action.crossFadeFrom(current, 0.08, false);
          } else if (idleAction && idleAction !== action) {
            action.crossFadeFrom(idleAction, 0.08, false);
          }

          action.play();
          a.mocapActive = action;
          a.onStrike && a.onStrike(index, key);
          return true;
        };

        const advanceMocap = () => {
          while (a.mocapQueue.length > 0) {
            const next = a.mocapQueue.shift();
            if (playMocapStrike(next.key, next.index)) return;
          }
          a.playing = false;
          if (idleAction) {
            idleAction.reset();
            idleAction.setEffectiveWeight(1);
            idleAction.play();
            if (a.mocapActive && a.mocapActive !== idleAction) {
              idleAction.crossFadeFrom(a.mocapActive, 0.12, false);
            }
            a.mocapActive = idleAction;
          }
          a.onDone && a.onDone();
        };

        mixer.addEventListener("finished", () => {
          if (!a.playing || !a.usingMocap) return;
          advanceMocap();
        });

        a.mocapMixer = mixer;
        a.mocapActions = actions;
        a.mocapIdle = idleAction;
        a.mocapReady = Object.keys(actions).length > 0;
        a.mocapAdvance = advanceMocap;
        a.usingMocap = a.mocapReady;
        setMocapLoaded(a.mocapReady);
      };

      loadMocap().catch((err) => {
        console.warn("FBX mocap loading failed, using procedural fallback.", err);
      });

      let lastT = performance.now();
      const tick = (now) => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;

        const a = animRef.current;
        a.idleSway += dt;

        if (a.mocapMixer) {
          a.mocapMixer.update(dt);
        }

        if (!a.usingMocap && a.currentAnim) {
          const anim = ANIMS[a.currentAnim];
          if (!anim) {
            a.currentAnim = null;
            a.time = 0;
            a.onDone && a.onDone();
            return;
          }
          a.time += dt;
          const progress = Math.min(1, a.time / anim.dur);
          const pose = getPoseAtTime(anim, progress);
          applyPose(joints, pose);

          if (progress >= 1) {
            a.currentAnim = null;
            a.time = 0;
            if (a.queue.length > 0) {
              const next = a.queue.shift();
              a.currentAnim = next.key;
              a.time = 0;
              a.onStrike && a.onStrike(next.index, next.key);
            } else {
              a.playing = false;
              a.onDone && a.onDone();
            }
          }
        } else if (!a.usingMocap) {
          const sway = Math.sin(a.idleSway * 1.5) * 0.015;
          const bob = Math.sin(a.idleSway * 2.2) * 0.005;
          const p = { ...STANCE };
          for (const j of JOINT_NAMES) p[j] = [...STANCE[j]];
          p.spine = [STANCE.spine[0] + sway, STANCE.spine[1], STANCE.spine[2]];
          p.hips = [STANCE.hips[0], STANCE.hips[1], STANCE.hips[2] + sway * 0.5];
          root.position.y = bob;
          applyPose(joints, p);
        }

        const orbitAngle = a.idleSway * 0.07;
        camera.position.x = 0.85 + Math.sin(orbitAngle) * 0.34;
        camera.position.z = 3.95 + Math.cos(orbitAngle) * 0.22 - 0.22;
        camera.lookAt(0, 1.0, 0);

        renderer.render(scene, camera);
      };

      raf = requestAnimationFrame(tick);
      window.addEventListener("resize", handleResize);
    } catch (err) {
      console.error("3D setup failed", err);
      setSceneError(err instanceof Error ? err.message : "Unknown 3D setup error.");
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      if (renderer) renderer.dispose();
    };
  }, []);

  // Mirror for southpaw
  useEffect(() => {
    if (threeRef.current) {
      const flip = stance === "southpaw" ? -1 : 1;
      threeRef.current.root.scale.x = flip;
      if (threeRef.current.mocapRoot) threeRef.current.mocapRoot.scale.x = Math.abs(threeRef.current.mocapRoot.scale.x) * flip;
    }
  }, [stance]);

  const addStrike = useCallback((key) => {
    if (combo.length >= 8) return;
    setCombo(prev => [...prev, key]);
  }, [combo.length]);

  const playCombo = useCallback(() => {
    if (!combo.length || playing) return;
    setPlaying(true);
    setActiveIdx(0);
    setCurrentStrikeName(STRIKES[combo[0]].label);

    const a = animRef.current;
    if (a.mocapReady && a.mocapAdvance) {
      a.usingMocap = true;
      a.playing = true;
      a.mocapQueue = combo.map((k, i) => ({ key: k, index: i }));
      a.onStrike = (idx, key) => {
        setActiveIdx(idx);
        setCurrentStrikeName(STRIKES[key].label);
      };
      a.onDone = () => {
        setPlaying(false);
        setActiveIdx(null);
        setCurrentStrikeName("");
      };
      a.mocapAdvance();
      return;
    }

    const legacyCombo = combo.filter((k) => ANIMS[k]);
    if (!legacyCombo.length) {
      setPlaying(false);
      setActiveIdx(null);
      setCurrentStrikeName("");
      return;
    }

    a.usingMocap = false;
    a.queue = legacyCombo.slice(1).map((k, i) => ({ key: k, index: i + 1 }));
    a.currentAnim = legacyCombo[0];
    a.time = 0;
    a.playing = true;
    a.onStrike = (idx, key) => {
      setActiveIdx(idx);
      setCurrentStrikeName(STRIKES[key].label);
    };
    a.onDone = () => {
      setPlaying(false);
      setActiveIdx(null);
      setCurrentStrikeName("");
    };
  }, [combo, playing]);

  const clearCombo = useCallback(() => {
    setCombo([]);
    setActiveIdx(null);
    setPlaying(false);
    setCurrentStrikeName("");
    const a = animRef.current;
    a.queue = [];
    a.currentAnim = null;
    a.playing = false;
    a.mocapQueue = [];
    if (a.mocapMixer) {
      a.mocapMixer.stopAllAction();
      if (a.mocapIdle) a.mocapIdle.play();
      a.mocapActive = a.mocapIdle || null;
    }
  }, []);

  const rating = getComboRating(combo);
  const cats = {
    all: Object.keys(STRIKES),
    punch: Object.keys(STRIKES).filter(k => STRIKES[k].type === "punch"),
    kick: Object.keys(STRIKES).filter(k => STRIKES[k].type === "kick"),
    elbow: Object.keys(STRIKES).filter(k => STRIKES[k].type === "elbow"),
    knee: Object.keys(STRIKES).filter(k => STRIKES[k].type === "knee"),
    combo: Object.keys(STRIKES).filter(k => STRIKES[k].type === "combo"),
    grapple: Object.keys(STRIKES).filter(k => STRIKES[k].type === "grapple"),
    stance: Object.keys(STRIKES).filter(k => STRIKES[k].type === "stance"),
  };
  const filtered = cats[category] || cats.all;
  const categoryDefs = [
    { id: "all", label: "ALL", c: "#888" },
    { id: "punch", label: "PUNCH", c: "#FF4136" },
    { id: "kick", label: "KICK", c: "#00D4FF" },
    { id: "elbow", label: "ELBOW", c: "#E8175D" },
    { id: "knee", label: "KNEE", c: "#B10DC9" },
    { id: "combo", label: "COMBO", c: "#FF8C42" },
    { id: "grapple", label: "GRAPPLE", c: "#00A86B" },
    { id: "stance", label: "STANCE", c: "#AAAAAA" },
  ].filter((cat) => cat.id === "all" || cats[cat.id].length > 0);

  const btn = {
    border: "1px solid #282828",
    borderRadius: 4,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    cursor: "pointer",
    transition: "all 0.15s",
    outline: "none",
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a", color: "#ddd",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace", padding: "16px 12px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 9, letterSpacing: 6, color: "#444", marginBottom: 3 }}>MUAY THAI</div>
        <h1 style={{
          fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: 3,
          background: "linear-gradient(135deg, #FF4136, #FF6B35, #E8175D)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>STRIKING LAB</h1>
        <div style={{ fontSize: 9, letterSpacing: 4, color: "#333", marginTop: 2 }}>3D COMBO VISUALISER</div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, maxWidth: 1200, margin: "0 auto" }}>
        {/* LEFT — Controls */}
        <div style={{ flex: "1 1 320px", minWidth: 280, maxWidth: 420 }}>
          {/* Stance */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 4 }}>STANCE</div>
            <div style={{ display: "flex", gap: 4 }}>
              {["orthodox", "southpaw"].map(s => (
                <button key={s} onClick={() => setStance(s)} style={{
                  ...btn, flex: 1, padding: "6px 0", fontSize: 10,
                  background: stance === s ? "#FF413618" : "#0f0f0f",
                  color: stance === s ? "#FF4136" : "#555",
                  borderColor: stance === s ? "#FF413655" : "#1a1a1a",
                  textTransform: "uppercase", letterSpacing: 1,
                }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Combo Chain */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 4 }}>
              COMBO CHAIN ({combo.length}/8)
            </div>
            <div style={{
              background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 6,
              padding: 10, minHeight: 44, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap",
            }}>
              {combo.length === 0 ? (
                <span style={{ color: "#222", fontSize: 11 }}>Add strikes below...</span>
              ) : combo.map((key, i) => {
                const s = STRIKES[key];
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{
                      padding: "4px 8px", fontSize: 11, borderRadius: 3,
                      background: i === activeIdx ? `${s.color}25` : "#151515",
                      color: s.color, border: `1px solid ${i === activeIdx ? s.color : "#222"}`,
                      boxShadow: i === activeIdx ? `0 0 8px ${s.color}44` : "none",
                      transition: "all 0.2s",
                    }}>{s.short}</span>
                    {i < combo.length - 1 && <span style={{ color: "#222", fontSize: 12 }}>→</span>}
                  </div>
                );
              })}
            </div>
            {combo.length > 0 && (
              <div style={{ fontSize: 9, color: "#333", marginTop: 3 }}>
                {combo.map(k => STRIKES[k].label).join(" → ")}
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
            <button onClick={playCombo} disabled={!combo.length || playing} style={{
              ...btn, flex: 2, padding: "9px 0", fontSize: 11,
              background: combo.length && !playing ? "#FF413620" : "#0d0d0d",
              color: combo.length && !playing ? "#FF4136" : "#2a2a2a",
              borderColor: combo.length && !playing ? "#FF413650" : "#151515",
              letterSpacing: 2,
            }}>{playing ? "PLAYING..." : "▶ PLAY"}</button>
            <button onClick={() => setCombo(c => c.slice(0, -1))} disabled={!combo.length} style={{
              ...btn, flex: 1, padding: "9px 0", fontSize: 10,
              background: "#0f0f0f", color: combo.length ? "#666" : "#2a2a2a", borderColor: "#1a1a1a",
            }}>UNDO</button>
            <button onClick={clearCombo} disabled={!combo.length} style={{
              ...btn, flex: 1, padding: "9px 0", fontSize: 10,
              background: "#0f0f0f", color: combo.length ? "#666" : "#2a2a2a", borderColor: "#1a1a1a",
            }}>CLEAR</button>
          </div>

          {/* Stats */}
          {combo.length > 0 && (
            <div style={{
              background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 6, padding: 12, marginBottom: 12,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 9, color: "#444", letterSpacing: 2 }}>ANALYSIS</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 1,
                  color: rating.label === "Devastating" ? "#FF4136" : rating.label === "Sharp" ? "#FF6B35" :
                    rating.label === "Solid" ? "#00D4FF" : "#555",
                }}>{rating.label.toUpperCase()}</span>
              </div>
              <Bar label="POWER" value={rating.power} color="#FF4136" />
              <Bar label="SPEED" value={rating.speed} color="#00D4FF" />
              <Bar label="FLOW" value={rating.flow} color="#B10DC9" />
            </div>
          )}

          {/* Category filter */}
          <div style={{ display: "flex", gap: 3, marginBottom: 8, flexWrap: "wrap" }}>
            {categoryDefs.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)} style={{
                ...btn, padding: "4px 8px", fontSize: 9,
                background: category === cat.id ? `${cat.c}15` : "#0f0f0f",
                color: category === cat.id ? cat.c : "#444",
                borderColor: category === cat.id ? `${cat.c}44` : "#1a1a1a",
                letterSpacing: 1,
              }}>{cat.label}</button>
            ))}
          </div>

          {/* Strike Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 5, marginBottom: 14 }}>
            {filtered.map(key => {
              const s = STRIKES[key];
              const dis = combo.length >= 8;
              return (
                <button key={key} onClick={() => addStrike(key)} disabled={dis} style={{
                  ...btn, padding: "8px 7px", textAlign: "left",
                  background: dis ? "#090909" : "#0f0f0f", borderColor: dis ? "#111" : "#222",
                  opacity: dis ? 0.35 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: s.color, fontWeight: 700 }}>{s.short}</span>
                    <span style={{ fontSize: 7, color: "#3a3a3a", textTransform: "uppercase",
                      background: "#141414", padding: "1px 4px", borderRadius: 2 }}>{s.target}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 8, color: "#4d4d4d", marginTop: 1 }}>{key}.fbx</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 8, color: "#FF413666" }}>PWR {s.power}</span>
                    <span style={{ fontSize: 8, color: "#00D4FF66" }}>SPD {s.speed}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Classics */}
          <div>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 6 }}>CLASSIC COMBOS</div>
            {CLASSIC_COMBOS.map((c, i) => (
              <button key={i} onClick={() => setCombo(c.keys)} style={{
                ...btn, width: "100%", padding: "8px 10px", textAlign: "left", marginBottom: 4,
                background: "#0e0e0e", borderColor: "#1a1a1a",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 11, color: "#bbb", fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 8, color: "#444", marginTop: 1 }}>{c.desc}</div>
                </div>
                <div style={{ fontSize: 9, color: "#333" }}>
                  {c.keys.map(k => STRIKES[k].short).join("→")}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT — 3D Viewport */}
        <div ref={containerRef} style={{ flex: "2 1 500px", minWidth: 340, position: "relative" }}>
          <div style={{
            background: "#080808", border: "1px solid #1a1a1a", borderRadius: 8,
            overflow: "hidden", position: "relative",
          }}>
            <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} />

            {sceneError && (
              <div style={{
                position: "absolute", top: 16, left: 16, right: 16,
                padding: "10px 12px", borderRadius: 6,
                background: "rgba(120, 0, 0, 0.65)", border: "1px solid rgba(255, 65, 54, 0.7)",
                color: "#ffd6d1", fontSize: 12, lineHeight: 1.4,
              }}>
                3D render failed: {sceneError}
              </div>
            )}

            {/* Overlay — current strike name */}
            {currentStrikeName && (
              <div style={{
                position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
                padding: "8px 24px", borderRadius: 4,
                background: "rgba(204, 26, 0, 0.15)", border: "1px solid rgba(204, 26, 0, 0.4)",
                backdropFilter: "blur(8px)",
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#FF4136", letterSpacing: 3, textAlign: "center" }}>
                  {currentStrikeName.toUpperCase()}
                </div>
              </div>
            )}

            {/* Corner labels */}
            <div style={{ position: "absolute", top: 12, left: 14, fontSize: 9, color: "#333", letterSpacing: 2 }}>
              {stance.toUpperCase()}
            </div>
            <div style={{ position: "absolute", top: 12, right: 14, fontSize: 9, color: "#2a2a2a", letterSpacing: 1 }}>
              3D VIEW
            </div>
            <div style={{ position: "absolute", top: 28, right: 14, fontSize: 9, letterSpacing: 1, color: mocapLoaded ? "#5bc98f" : "#6f5a52" }}>
              {mocapLoaded ? "FBX MOCAP" : "PROC FALLBACK"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
