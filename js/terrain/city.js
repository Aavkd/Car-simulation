import * as THREE from 'three';
import { SurfaceTypes } from '../physics/physics-provider.js';
import { PerlinNoise } from './terrain.js';

/**
 * City Generator
 * Procedurally generates a grid-based city with organic districts, road warping, and realistic layout.
 */
export class CityGenerator {
    constructor(params = {}) {
        this.seed = params.seed || 12345;
        this.scale = params.scale || 2.2;
        this.noise = new PerlinNoise(this.seed);

        // Dimensions
        this.size = params.size || 40000; // Increased size
        this.blockSize = (params.blockSize || 140) * this.scale;
        this.roadWidth = (params.roadWidth || 20) * this.scale;
        this.curbMargin = 4.0 * this.scale;

        // Physics
        this.groundHeight = 0;
        this.sidewalkHeight = (params.sidewalkHeight !== undefined ? params.sidewalkHeight : 0.25) * this.scale;
        this.sidewalkWidth = 5 * this.scale;

        // Logic
        this.avenueInterval = 4;
        this.gridStep = this.blockSize + this.roadWidth;

        // Organic Parameters
        this.warpScale = 0.002 / this.scale; // Scale of road warping
        this.warpStrength = 60 * this.scale; // How much roads deviate from grid (in meters)

        // Meshes
        this.mesh = null;
        this.buildingMesh = null;
        this.sidewalkMeshes = []; // Array of instanced meshes for variety

        // Cache
        this._districtCache = new Map();

        // Lighting System
        this.allLights = []; // Stores {x,y,z} of all placed lights
        this.lightPool = [];
        this.lightPoolSize = 20; // Number of active dynamic lights
    }

    rand(n) {
        return Math.abs(Math.sin(n * 12.9898 + this.seed) * 43758.5453) % 1;
    }

    /**
     * Helper: Get intersection of two infinite lines defined by (p1, p2) and (p3, p4)
     */
    _getLineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.z;
        const x2 = p2.x, y2 = p2.z;
        const x3 = p3.x, y3 = p3.z;
        const x4 = p4.x, y4 = p4.z;

        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (Math.abs(denom) < 0.001) return null; // Parallel

        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;

        return {
            x: x1 + ua * (x2 - x1),
            z: y1 + ua * (y2 - y1)
        };
    }

    /**
     * Helper: Inset a polygon by a specific amount
     * Assumes CW or CCW ordering. Returns new vertices.
     */
    _insetPolygon(poly, amount) {
        const newPoly = [];
        const len = poly.length;

        const lines = [];

        // 1. Create shifted lines for each edge
        for (let i = 0; i < len; i++) {
            const p1 = poly[i];
            const p2 = poly[(i + 1) % len];

            const dx = p2.x - p1.x;
            const dy = p2.z - p1.z;
            const lenSq = dx * dx + dy * dy;
            const length = Math.sqrt(lenSq);

            const nx = -dy / length;
            const nz = dx / length;

            // Shift line
            // Point on line: p1 + normal * amount
            const s1 = { x: p1.x + nx * amount, z: p1.z + nz * amount };
            const s2 = { x: p2.x + nx * amount, z: p2.z + nz * amount };

            lines.push({ p1: s1, p2: s2 });
        }

        // 2. Intersect shifted lines
        for (let i = 0; i < len; i++) {
            const l1 = lines[i];
            const l2 = lines[(i + 1) % len];

            const inter = this._getLineIntersection(l1.p1, l1.p2, l2.p1, l2.p2);
            if (inter) {
                newPoly.push(inter);
            } else {
                newPoly.push(l1.p2);
            }
        }

        return newPoly;
    }

    /**
     * Generate the city mesh
     */
    generate() {
        console.log('[CityGenerator] Starting generation...');
        this.mesh = new THREE.Group();
        this.blockPolygons = new Map(); // Store generated polygons for physics

        // 1. Create Base Terrain Plane (Ground underneath)
        const groundGeo = new THREE.PlaneGeometry(this.size, this.size, 128, 128);
        groundGeo.rotateX(-Math.PI / 2);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x080808 }); // Dark Grey/Black
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.receiveShadow = true;
        this.mesh.add(ground);

        // 2. Prepare Building & Road Instances
        const blocksPerSide = Math.floor(this.size / this.gridStep);
        const maxRadiusBlocks = Math.floor(blocksPerSide / 2);
        const totalBlocksApprox = Math.floor(Math.PI * maxRadiusBlocks * maxRadiusBlocks);

        console.log(`[CityGenerator] Grid size: ${blocksPerSide}x${blocksPerSide}, Approx blocks: ${totalBlocksApprox}`);

        // Buildings
        const maxBuildings = totalBlocksApprox * 8;
        const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
        buildingGeo.translate(0, 0.5, 0);
        const buildingMat = this._createBuildingMaterial();

        this.buildingMesh = new THREE.InstancedMesh(buildingGeo, buildingMat, maxBuildings);
        this.buildingMesh.receiveShadow = true;
        this.buildingMesh.castShadow = true;
        this.buildingMesh.frustumCulled = false;

        // Roads
        const roadMaxCount = totalBlocksApprox * 5;
        const roadGeo = new THREE.PlaneGeometry(1, 1);
        roadGeo.rotateX(-Math.PI / 2);
        const roadMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
        this.roadMesh = new THREE.InstancedMesh(roadGeo, roadMat, roadMaxCount);
        this.roadMesh.receiveShadow = true;
        this.roadMesh.frustumCulled = false;

        // Sidewalk Buffer Geometry Arrays
        const sidewalkPositions = [];
        const sidewalkNormals = [];
        // Helper to add quad to buffer
        const addQuad = (v1, v2, v3, v4, y) => {
            // Top Face (2 triangles: v1-v4-v2, v2-v4-v3)
            // v1=NW, v2=NE, v3=SE, v4=SW
            sidewalkPositions.push(
                v1.x, y, v1.z, v4.x, y, v4.z, v2.x, y, v2.z,
                v2.x, y, v2.z, v4.x, y, v4.z, v3.x, y, v3.z
            );
            // Normals (Up)
            for (let k = 0; k < 6; k++) sidewalkNormals.push(0, 1, 0);

            // Sides (Skirt) - Extend down to 0
            const addSide = (pA, pB) => {
                sidewalkPositions.push(
                    pA.x, y, pA.z, pB.x, y, pB.z, pA.x, 0, pA.z,
                    pA.x, 0, pA.z, pB.x, y, pB.z, pB.x, 0, pB.z
                );
                // Calculate side normal
                const dx = pB.x - pA.x;
                const dz = pB.z - pA.z;
                const len = Math.sqrt(dx * dx + dz * dz);
                const nx = dz / len; // 90 deg rotation
                const nz = -dx / len;
                for (let k = 0; k < 6; k++) sidewalkNormals.push(nx, 0, nz);
            };

            addSide(v1, v2); // North
            addSide(v2, v3); // East
            addSide(v3, v4); // South
            addSide(v4, v1); // West
        };

        // 3. Populate Grid
        let buildingIdx = 0;
        let roadIdx = 0;
        const dummy = new THREE.Object3D();
        const color = new THREE.Color();
        const range = maxRadiusBlocks;
        const insetAmount = (this.roadWidth / 2) + this.curbMargin;

        for (let x = -range; x <= range; x++) {
            for (let z = -range; z <= range; z++) {
                const rawX = x * this.gridStep;
                const rawZ = z * this.gridStep;
                const dist = Math.sqrt(rawX * rawX + rawZ * rawZ);
                if (dist > this.size / 2 - 500) continue;

                const pos = this._getDistortedPos(rawX, rawZ);
                const district = this._getDistrict(pos.x, pos.z);

                if (district.type === 'water') continue;

                // --- Calculate Road Network Nodes ---
                const getP = (ox, oz) => this._getDistortedPos((x + ox) * this.gridStep, (z + oz) * this.gridStep);

                const pC = pos;
                const pR = getP(1, 0);
                const pD = getP(0, 1);
                const pL = getP(-1, 0);
                const pU = getP(0, -1);

                const pRD = getP(1, 1);
                const pRU = getP(1, -1);
                const pLD = getP(-1, 1);

                // East Line: Mid(C, R) -> Mid(D, RD)
                const midCR = { x: (pC.x + pR.x) * 0.5, z: (pC.z + pR.z) * 0.5 };
                const midDRD = { x: (pD.x + pRD.x) * 0.5, z: (pD.z + pRD.z) * 0.5 };

                // South Line: Mid(C, D) -> Mid(R, RD)
                const midCD = { x: (pC.x + pD.x) * 0.5, z: (pC.z + pD.z) * 0.5 };
                const midRRD = { x: (pR.x + pRD.x) * 0.5, z: (pR.z + pRD.z) * 0.5 };

                // West Line: Mid(L, C) -> Mid(LD, D)
                const midLC = { x: (pL.x + pC.x) * 0.5, z: (pL.z + pC.z) * 0.5 };
                const midLDD = { x: (pLD.x + pD.x) * 0.5, z: (pLD.z + pD.z) * 0.5 };

                // North Line: Mid(U, C) -> Mid(RU, R)
                const midUC = { x: (pU.x + pC.x) * 0.5, z: (pU.z + pC.z) * 0.5 };
                const midRUR = { x: (pRU.x + pR.x) * 0.5, z: (pRU.z + pR.z) * 0.5 };

                // Calculate Intersections (Corners)
                const nw = this._getLineIntersection(midUC, midRUR, midLC, midLDD);
                const ne = this._getLineIntersection(midUC, midRUR, midCR, midDRD);
                const se = this._getLineIntersection(midCD, midRRD, midCR, midDRD);
                const sw = this._getLineIntersection(midCD, midRRD, midLC, midLDD);

                if (!nw || !ne || !se || !sw) continue;

                // Polygon [NW, NE, SE, SW]
                const poly = [nw, ne, se, sw];

                const centroid = {
                    x: (nw.x + ne.x + se.x + sw.x) / 4,
                    z: (nw.z + ne.z + se.z + sw.z) / 4
                };

                // Inset
                let finalPoly = this._insetPolygon(poly, insetAmount);

                // Sanity check: distance to centroid should decrease
                const dOld = Math.hypot(poly[0].x - centroid.x, poly[0].z - centroid.z);
                const dNew = Math.hypot(finalPoly[0].x - centroid.x, finalPoly[0].z - centroid.z);

                if (dNew > dOld) {
                    poly.reverse();
                    finalPoly = this._insetPolygon(poly, insetAmount);
                }

                // Store for Physics
                const gridKey = `${x},${z}`;
                this.blockPolygons.set(gridKey, {
                    poly: finalPoly,
                    height: this.sidewalkHeight,
                    centroid: centroid
                });

                // Add to Visual Mesh
                addQuad(finalPoly[0], finalPoly[1], finalPoly[2], finalPoly[3], this.sidewalkHeight);

                // --- Generate Buildings ---
                const dWest = Math.hypot(poly[0].x - poly[3].x, poly[0].z - poly[3].z);
                const dNorth = Math.hypot(poly[0].x - poly[1].x, poly[0].z - poly[1].z);
                const avgSize = (dWest + dNorth) / 2;

                const tanX = new THREE.Vector3(poly[1].x - poly[0].x, 0, poly[1].z - poly[0].z).normalize();
                const angle = Math.atan2(tanX.z, tanX.x);

                if (district.type !== 'park' && district.type !== 'outskirts') {
                    const buildings = this._generateBuildingsForBlock(district, centroid.x, centroid.z, avgSize, angle);
                    buildings.forEach(b => {
                        dummy.position.set(b.x, this.sidewalkHeight, b.z);
                        dummy.scale.set(b.w, b.h, b.d);
                        dummy.rotation.y = b.rot;
                        dummy.updateMatrix();

                        if (district.type === 'downtown') color.setHex(0x88ccff).multiplyScalar(0.5 + Math.random() * 0.5);
                        else if (district.type === 'commercial') color.setHex(0xaaaaaa).multiplyScalar(0.8 + Math.random() * 0.2);
                        else if (district.type === 'industrial') color.setHex(0x887766).multiplyScalar(0.8 + Math.random() * 0.4);
                        else color.setHex(0xddeeff).multiplyScalar(0.9 + Math.random() * 0.1);

                        this.buildingMesh.setMatrixAt(buildingIdx, dummy.matrix);
                        this.buildingMesh.setColorAt(buildingIdx, color);
                        buildingIdx++;
                    });
                }
            }
        }

        // Finalize Sidewalk Mesh
        const swGeo = new THREE.BufferGeometry();
        swGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidewalkPositions, 3));
        swGeo.setAttribute('normal', new THREE.Float32BufferAttribute(sidewalkNormals, 3));
        const swMat = new THREE.MeshLambertMaterial({
            color: 0x555555,
            flatShading: false
        });
        const sidewalkMesh = new THREE.Mesh(swGeo, swMat);
        sidewalkMesh.receiveShadow = true;
        sidewalkMesh.castShadow = true;
        this.mesh.add(sidewalkMesh);


        // --- 4. Road Generation & Markings ---
        // Markings
        const markingMaxCount = totalBlocksApprox * 40;
        const markingGeo = new THREE.PlaneGeometry(0.8 * this.scale, 3 * this.scale);
        markingGeo.rotateX(-Math.PI / 2);
        const markingMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide });
        this.markingMesh = new THREE.InstancedMesh(markingGeo, markingMat, markingMaxCount);
        this.markingMesh.receiveShadow = true;
        this.markingMesh.frustumCulled = false;

        let markingIdx = 0;
        const dashStride = 12 * this.scale;
        const markRange = range - 1;

        dummy.scale.set(1, 1, 1);

        for (let x = -markRange; x <= markRange; x++) {
            for (let z = -markRange; z <= markRange; z++) {
                const rawX = x * this.gridStep;
                const rawZ = z * this.gridStep;
                const dist = Math.sqrt(rawX * rawX + rawZ * rawZ);
                if (dist > this.size / 2 - 600) continue;

                const p0 = this._getDistortedPos(rawX, rawZ);
                const pos = new THREE.Vector3(p0.x, p0.y, p0.z);
                const p1 = this._getDistortedPos(rawX + this.gridStep, rawZ);
                const rightX = new THREE.Vector3(p1.x, p1.y, p1.z);
                const p2 = this._getDistortedPos(rawX, rawZ + this.gridStep);
                const downZ = new THREE.Vector3(p2.x, p2.y, p2.z);
                const p3 = this._getDistortedPos(rawX + this.gridStep, rawZ + this.gridStep);
                const diagPos = new THREE.Vector3(p3.x, p3.y, p3.z);

                // Vertical (East)
                const vNodeCurr = new THREE.Vector3().addVectors(pos, rightX).multiplyScalar(0.5);
                const vNodeNext = new THREE.Vector3().addVectors(downZ, diagPos).multiplyScalar(0.5);
                const vGap = pos.distanceTo(rightX);

                if (vGap > this.blockSize * 0.5) {
                    const segmentVec = new THREE.Vector3().subVectors(vNodeNext, vNodeCurr);
                    const segmentLen = segmentVec.length();

                    if (segmentLen < this.gridStep * 2) {
                        const dir = segmentVec.clone().normalize();
                        const angle = Math.atan2(dir.x, dir.z);
                        const mid = new THREE.Vector3().addVectors(vNodeCurr, vNodeNext).multiplyScalar(0.5);

                        dummy.position.copy(mid);
                        dummy.position.y = 0.05 * this.scale;
                        dummy.rotation.set(0, angle, 0);
                        // Scale: X=Width, Z=Length + fixed overlap (not percentage, to avoid excessive protrusion on long segments)
                        dummy.scale.set(this.roadWidth, 1, segmentLen + 1.0 * this.scale);
                        dummy.updateMatrix();
                        this.roadMesh.setMatrixAt(roadIdx++, dummy.matrix);

                        const count = Math.floor(segmentLen / dashStride);
                        for (let k = 0; k < count; k++) {
                            const t = (k + 0.5) * dashStride - segmentLen / 2;
                            const t2 = (k + 0.5) * dashStride;
                            dummy.position.copy(vNodeCurr).addScaledVector(dir, t2);
                            dummy.position.y = 0.15 * this.scale;
                            dummy.rotation.set(0, 0, 0);
                            dummy.lookAt(dummy.position.clone().add(dir));
                            dummy.scale.set(1, 1, 1);
                            dummy.updateMatrix();
                            this.markingMesh.setMatrixAt(markingIdx++, dummy.matrix);
                        }
                    }
                }

                // Horizontal (South)
                const hNodeCurr = new THREE.Vector3().addVectors(pos, downZ).multiplyScalar(0.5);
                const hNodeNext = new THREE.Vector3().addVectors(rightX, diagPos).multiplyScalar(0.5);
                const hGap = pos.distanceTo(downZ);

                if (hGap > this.blockSize * 0.5) {
                    const segmentVec = new THREE.Vector3().subVectors(hNodeNext, hNodeCurr);
                    const segmentLen = segmentVec.length();

                    if (segmentLen < this.gridStep * 2) {
                        const dir = segmentVec.clone().normalize();
                        const angle = Math.atan2(dir.x, dir.z);
                        const mid = new THREE.Vector3().addVectors(hNodeCurr, hNodeNext).multiplyScalar(0.5);

                        dummy.position.copy(mid);
                        dummy.position.y = 0.05 * this.scale;
                        dummy.rotation.set(0, angle, 0);
                        // Scale: X=Width, Z=Length + fixed overlap (not percentage, to avoid excessive protrusion on long segments)
                        dummy.scale.set(this.roadWidth, 1, segmentLen + 1.0 * this.scale);
                        dummy.updateMatrix();
                        this.roadMesh.setMatrixAt(roadIdx++, dummy.matrix);

                        const count = Math.floor(segmentLen / dashStride);
                        for (let k = 0; k < count; k++) {
                            const t2 = (k + 0.5) * dashStride;
                            dummy.position.copy(hNodeCurr).addScaledVector(dir, t2);
                            dummy.position.y = 0.15 * this.scale;
                            dummy.rotation.set(0, 0, 0);
                            dummy.lookAt(dummy.position.clone().add(dir));
                            dummy.scale.set(1, 1, 1);
                            dummy.updateMatrix();
                            this.markingMesh.setMatrixAt(markingIdx++, dummy.matrix);
                        }
                    }
                }
            }
        }

        console.log(`[CityGenerator] Generated ${buildingIdx} buildings, ${roadIdx} roads.`);

        this.buildingMesh.count = buildingIdx;
        this.buildingMesh.instanceMatrix.needsUpdate = true;
        if (this.buildingMesh.instanceColor) this.buildingMesh.instanceColor.needsUpdate = true;
        this.mesh.add(this.buildingMesh);

        this.roadMesh.count = roadIdx;
        this.roadMesh.instanceMatrix.needsUpdate = true;
        this.mesh.add(this.roadMesh);

        this.markingMesh.instanceMatrix.needsUpdate = true;
        this.mesh.add(this.markingMesh);

        // --- 5. Street Lights ---
        // Create Geometries
        const poleHeight = 8 * this.scale;
        const poleWidth = 0.3 * this.scale;
        const armLength = 3 * this.scale;

        // Pole Geometry (Merged manually for simplicity without Utils)
        // Vertical part
        const poleGeo = new THREE.BoxGeometry(poleWidth, poleHeight, poleWidth);
        poleGeo.translate(0, poleHeight / 2, 0);

        // Arm part
        const armGeo = new THREE.BoxGeometry(poleWidth, poleWidth, armLength);
        armGeo.translate(0, poleHeight - 0.5 * this.scale, armLength / 2 - poleWidth / 2);

        // Merge into one buffer geometry (simplest way: create new buffer attrs)
        // Actually, just using two instanced meshes is easier than manual merging without utils
        // Let's stick to a single mesh for the pole structure: We'll construct it:
        // Or better: Use a group? No, InstancedMesh.
        // Let's just use a simple L-shape approximation: Just the vertical pole and a separate arm mesh?
        // Optimization: Let's just standard BoxGeometry but verify if we can merge.
        // Alternative: Just render the vertical pole.
        // Let's try to do it properly:

        // Simple approach: Pole Mesh (Vertical) + Arm Mesh (Horizontal) + Bulb Mesh
        const lightCount = totalBlocksApprox * 12; // Fewer than markings

        const polesMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        this.poleMesh = new THREE.InstancedMesh(poleGeo, polesMat, lightCount);
        this.poleMesh.receiveShadow = true;
        this.poleMesh.castShadow = true;

        const armMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        this.armMesh = new THREE.InstancedMesh(armGeo, armMat, lightCount);
        this.armMesh.receiveShadow = true;
        this.armMesh.castShadow = true;

        const bulbGeo = new THREE.BoxGeometry(0.5 * this.scale, 0.1 * this.scale, 0.8 * this.scale);
        bulbGeo.translate(0, poleHeight - 0.6 * this.scale, armLength - 0.6 * this.scale);
        this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        this.bulbMesh = new THREE.InstancedMesh(bulbGeo, this.bulbMat, lightCount);

        const bulbPosVector = new THREE.Vector3(0, poleHeight - 0.6 * this.scale, armLength - 0.6 * this.scale);
        const glowPositions = [];

        let lightIdx = 0;
        const lightSpacing = dashStride * 4; // Every ~48 units

        const placeLight = (pos, dir, sideOffset) => {
            if (lightIdx >= lightCount) return;

            // Perpendicular vector
            const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

            // Position: pos + perp * sideOffset
            const lightPos = pos.clone().addScaledVector(perp, sideOffset);

            // Rotation: Face the road (perp * -1 or 1 depends on side)
            // If sideOffset is positive (Right side), perp points Right. We want arm to point Left (towards road).
            // So lookAt should be pos.
            const target = pos.clone();
            target.y = lightPos.y; // Keep level

            dummy.position.copy(lightPos);
            dummy.position.y = this.sidewalkHeight;
            dummy.lookAt(target);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();

            this.poleMesh.setMatrixAt(lightIdx, dummy.matrix);
            this.armMesh.setMatrixAt(lightIdx, dummy.matrix);
            this.bulbMesh.setMatrixAt(lightIdx, dummy.matrix);

            // Calculate world position for the glow point
            const bulbWorld = bulbPosVector.clone().applyMatrix4(dummy.matrix);
            glowPositions.push(bulbWorld.x, bulbWorld.y, bulbWorld.z);

            // Store for dynamic lighting system
            this.allLights.push({
                x: bulbWorld.x,
                y: bulbWorld.y,
                z: bulbWorld.z
            });

            lightIdx++;
        };

        // Reuse the road loops logic?
        // We can just iterate separately or hook into the existing loop.
        // To save code duplication, let's just re-iterate or copy the logic blocks.
        // Since the previous loop was modifying matrices directly, I'll copy the structure here for clarity and safety.

        // Creating a helper for road segments to avoid huge duplication would be best, but adhering to "modifying existing structure":
        // I will append the light generation to the SAME loop where markings are made.
        // Wait, I cannot because the previous block ends at line 428 and I am inserting AFTER it.
        // It's cleaner to have a separate loop or modify the code above.
        // The prompt implies I am adding code.
        // I will perform a separate pass for lights over the grid, it's fast enough.

        for (let x = -markRange; x <= markRange; x++) {
            for (let z = -markRange; z <= markRange; z++) {
                const rawX = x * this.gridStep;
                const rawZ = z * this.gridStep;
                const dist = Math.sqrt(rawX * rawX + rawZ * rawZ);
                if (dist > this.size / 2 - 600) continue;

                const p0 = this._getDistortedPos(rawX, rawZ);
                const pos = new THREE.Vector3(p0.x, p0.y, p0.z);
                const p1 = this._getDistortedPos(rawX + this.gridStep, rawZ);
                const rightX = new THREE.Vector3(p1.x, p1.y, p1.z);
                const p2 = this._getDistortedPos(rawX, rawZ + this.gridStep);
                const downZ = new THREE.Vector3(p2.x, p2.y, p2.z);
                const p3 = this._getDistortedPos(rawX + this.gridStep, rawZ + this.gridStep);
                const diagPos = new THREE.Vector3(p3.x, p3.y, p3.z);

                // Vertical (Eastward in grid, but logic says Vertical/Horizontal)
                // Note: Variable names in original code: 'rightX' implies X axis (Horizontal?), 'downZ' implies Z axis (Vertical?)
                // Original code comments: "Vertical (East)" and "Horizontal (South)". Let's trust the vector math.

                // Segment 1: pos -> rightX
                const vNodeCurr = new THREE.Vector3().addVectors(pos, rightX).multiplyScalar(0.5);
                const vNodeNext = new THREE.Vector3().addVectors(downZ, diagPos).multiplyScalar(0.5);

                // Original code creates road between vNodeCurr and vNodeNext?
                // Wait, let's re-read the road generation lines 356-364.
                // vNodeCurr = Mid(TL, TR) -> Top Edge Center?
                // vNodeNext = Mid(BL, BR) -> Bottom Edge Center?
                // Segment = Top Center to Bottom Center. This is a Vertical road (Z-axis aligned).

                const vGap = pos.distanceTo(rightX);
                if (vGap > this.blockSize * 0.5) { // If gap is wide enough for a road
                    const segmentVec = new THREE.Vector3().subVectors(vNodeNext, vNodeCurr);
                    const segmentLen = segmentVec.length();
                    if (segmentLen < this.gridStep * 2) {
                        const dir = segmentVec.clone().normalize();
                        const offset = (this.roadWidth * 0.5) + (2 * this.scale); // Road half-width + margin

                        // Place lights along this segment
                        const count = Math.floor(segmentLen / lightSpacing);
                        for (let k = 1; k < count; k++) { // Start at 1 to avoid intersection clutter
                            const t = k * lightSpacing;
                            const lightP = vNodeCurr.clone().addScaledVector(dir, t);

                            // Left Side
                            placeLight(lightP, dir, -offset);
                            // Right Side
                            placeLight(lightP, dir, offset);
                        }
                    }
                }

                // Segment 2: pos -> downZ (Left Edge Center to Right Edge Center?)
                const hNodeCurr = new THREE.Vector3().addVectors(pos, downZ).multiplyScalar(0.5);
                const hNodeNext = new THREE.Vector3().addVectors(rightX, diagPos).multiplyScalar(0.5);
                // Segment = Left Center to Right Center. Horizontal road (X-axis aligned).

                const hGap = pos.distanceTo(downZ);
                if (hGap > this.blockSize * 0.5) {
                    const segmentVec = new THREE.Vector3().subVectors(hNodeNext, hNodeCurr);
                    const segmentLen = segmentVec.length();
                    if (segmentLen < this.gridStep * 2) {
                        const dir = segmentVec.clone().normalize();
                        const offset = (this.roadWidth * 0.5) + (2 * this.scale);

                        const count = Math.floor(segmentLen / lightSpacing);
                        for (let k = 1; k < count; k++) {
                            const t = k * lightSpacing;
                            const lightP = hNodeCurr.clone().addScaledVector(dir, t);

                            // Left Side
                            placeLight(lightP, dir, -offset);
                            // Right Side
                            placeLight(lightP, dir, offset);
                        }
                    }
                }
            }
        }

        console.log(`[CityGenerator] Generated ${lightIdx} street lights.`);

        this.poleMesh.count = lightIdx;
        this.armMesh.count = lightIdx;
        this.bulbMesh.count = lightIdx;

        this.poleMesh.instanceMatrix.needsUpdate = true;
        this.armMesh.instanceMatrix.needsUpdate = true;
        this.bulbMesh.instanceMatrix.needsUpdate = true;
        this.mesh.add(this.poleMesh);
        this.mesh.add(this.armMesh);
        this.mesh.add(this.bulbMesh);

        // Create Points for Glow
        const glowGeometry = new THREE.BufferGeometry();
        glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glowPositions, 3));

        const glowTex = this._createGlowTexture();
        this.glowMat = new THREE.PointsMaterial({
            color: 0xffaa00,
            map: glowTex,
            size: 3 * this.scale,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        this.glowPoints = new THREE.Points(glowGeometry, this.glowMat);
        this.mesh.add(this.glowPoints);

        // --- 6. Initialize Light Pool ---
        const poolGroup = new THREE.Group();
        // Use a warmer, more realistic sodium vapor color
        const lightColor = 0xff9933; 
        
        for (let i = 0; i < this.lightPoolSize; i++) {
            // Intensity: 1.5, Distance: ~100 units, Decay: 1.5
            const light = new THREE.PointLight(lightColor, 2.5, 60 * this.scale, 1.5);
            light.visible = false;
            // light.castShadow = true; // Too expensive for many lights
            this.lightPool.push(light);
            poolGroup.add(light);
        }
        this.mesh.add(poolGroup);

        return this.mesh;
    }

    /**
     * Generate building layout for a single block
     */
    _generateBuildingsForBlock(district, bx, bz, blockSize, blockAngle) {
        const buildings = [];
        // Reduced margin for tighter packing
        const margin = 1 * this.scale;
        // Since the base is round (cylinder), we need to fit square buildings inside it.
        // Inscribed square side = diameter / sqrt(2) ~= diameter * 0.707
        const usableSize = (blockSize * 0.707) - (this.sidewalkWidth * 2) - margin;

        // Random seed based on position
        const seed = Math.abs(Math.sin(bx * 12.9898 + bz * 78.233) * 43758.5453);
        const rand = (offset) => {
            return Math.abs(Math.sin(seed + offset) * 10000) % 1;
        };

        // Helper to add building in local space
        const addBuilding = (locX, locZ, w, d, h, rot) => {
            // Rotate local position
            const cos = Math.cos(blockAngle);
            const sin = Math.sin(blockAngle);

            const rX = locX * cos - locZ * sin;
            const rZ = locX * sin + locZ * cos;

            function normalizeAngle(a) {
                a = a % (Math.PI * 2);
                if (a > Math.PI) a -= Math.PI * 2;
                return a;
            }

            buildings.push({
                x: bx + rX,
                z: bz + rZ,
                w: w,
                d: d,
                h: h,
                rot: normalizeAngle(rot + blockAngle)
            });
        };

        if (district.type === 'downtown') {
            // Massive Skyscraper
            if (rand(1) > 0.65) {
                const height = (100 + rand(2) * 250) * this.scale;
                addBuilding(0, 0, usableSize * 0.85, usableSize * 0.85, height, 0);
            } else if (rand(1) > 0.35) {
                // Twin Towers - tighter
                const w = usableSize * 0.42;
                const h = (70 + rand(3) * 120) * this.scale;
                addBuilding(-w * 0.55, -w * 0.55, w, w, h * (0.9 + rand(4) * 0.2), 0);
                addBuilding(w * 0.55, w * 0.55, w, w, h, 0);
            } else {
                // Denser Cluster (5-8 buildings)
                const count = 5 + Math.floor(rand(2) * 4);
                const subSize = usableSize / 2.2; // Slightly overlap center
                for (let i = 0; i < count; i++) {
                    const ox = (rand(10 + i) - 0.5) * subSize * 1.8;
                    const oz = (rand(20 + i) - 0.5) * subSize * 1.8;
                    const w = subSize * (0.4 + rand(30 + i) * 0.6);
                    const h = (50 + rand(40 + i) * 120) * this.scale;
                    const rot = (rand(50 + i) < 0.2) ? rand(60 + i) * 0.2 : 0;
                    addBuilding(ox, oz, w, w, h, rot);
                }
            }
        }
        else if (district.type === 'commercial') {
            // Mid-rise
            if (rand(1) > 0.75) {
                // Wide office complex
                const h = (25 + rand(2) * 35) * this.scale;
                addBuilding(0, 0, usableSize * 0.95, usableSize * 0.7, h, 0);
            } else if (rand(1) > 0.4) {
                // 4 Quadrants - very tight
                const w = usableSize * 0.45;
                const hBase = (30 + rand(2) * 50) * this.scale;
                const offset = w * 0.55;
                addBuilding(-offset, -offset, w, w, hBase + rand(3) * 10 * this.scale, 0);
                addBuilding(offset, -offset, w, w, hBase + rand(4) * 10 * this.scale, 0);
                addBuilding(-offset, offset, w, w, hBase + rand(5) * 10 * this.scale, 0);
                addBuilding(offset, offset, w, w, hBase + rand(6) * 10 * this.scale, 0);
            } else {
                // 4x4 High Density Grid (up to 16 small buildings)
                const gridCount = 4;
                const cellSize = usableSize / gridCount;
                const bSize = cellSize * 0.9; // Minimal gap
                const start = -usableSize / 2 + cellSize / 2;

                for (let gx = 0; gx < gridCount; gx++) {
                    for (let gz = 0; gz < gridCount; gz++) {
                        if (rand(gx * 10 + gz) > 0.9) continue; // Only 10% chance of empty

                        const lx = start + gx * cellSize;
                        const lz = start + gz * cellSize;
                        const h = (15 + rand(gx * 20 + gz) * 50) * this.scale;
                        addBuilding(lx, lz, bSize, bSize, h, 0);
                    }
                }
            }
        }
        else if (district.type === 'industrial') {
            // Low, wide warehouses
            if (rand(1) > 0.5) {
                // Single large warehouse
                const w = usableSize * 0.85;
                const h = (12 + rand(1) * 12) * this.scale;
                addBuilding(0, 0, w, w, h, rand(2) * 0.1);
            } else {
                // Split warehouses
                const w = usableSize * 0.9;
                const d = usableSize * 0.4;
                const h = (12 + rand(3) * 12) * this.scale;
                addBuilding(0, -d * 0.6, w, d, h, rand(4) * 0.05);
                addBuilding(0, d * 0.6, w, d, h * (0.8 + rand(5) * 0.4), rand(6) * 0.05);
            }
        }
        else {
            // Residential / Suburbs
            // EXTREME density packing
            const w = 12 * this.scale;
            const h = (6 + rand(1) * 12) * this.scale;
            // INCREASED COUNT: Was 3-6, now 6-12
            const count = 6 + Math.floor(rand(2) * 7);

            for (let i = 0; i < count; i++) {
                const ox = (rand(10 + i) - 0.5) * (usableSize - w);
                const oz = (rand(20 + i) - 0.5) * (usableSize - w);

                // Varied sizes
                const thisW = w + rand(30 + i) * 6 * this.scale;
                const thisD = w + rand(40 + i) * 6 * this.scale;

                addBuilding(ox, oz, thisW, thisD, h + rand(50 + i) * 6 * this.scale, rand(60 + i) * Math.PI / 2);
            }
        }

        return buildings;
    }

    /**
     * Get distorted coordinates for organic road warping
     */
    _getDistortedPos(x, z) {
        // Warp the grid using noise
        const nx = this.noise.noise2D(x * this.warpScale, z * this.warpScale);
        const nz = this.noise.noise2D(x * this.warpScale + 1000, z * this.warpScale + 1000);

        return {
            x: x + nx * this.warpStrength,
            y: 0,
            z: z + nz * this.warpStrength
        };
    }

    /**
     * Determine district type by world coordinates
     */
    _getDistrict(x, z) {
        // Organic District Generation

        // 1. Density Noise (Large scale)
        const density = this.noise.fbm(x * 0.0003, z * 0.0003, 3, 2, 0.5);

        // 2. Type Noise (Industrial vs Residential vs Green)
        const typeVal = this.noise.noise2D(x * 0.0005 + 500, z * 0.0005 + 500);

        // Center is always dense (Downtown) with some noise
        const distFromCenter = Math.sqrt(x * x + z * z);
        const centerFalloff = Math.max(0, 1 - distFromCenter / 4000);

        // Combine density with center bias
        const finalDensity = density * 0.5 + centerFalloff * 0.8; // Bias towards center

        // Determine district
        if (finalDensity > 0.6) {
            return { type: 'downtown' };
        }

        if (finalDensity > 0.3) {
            if (typeVal > 0.2) return { type: 'commercial' };
            if (typeVal < -0.3) return { type: 'park' }; // Green Areas
            return { type: 'residential' }; // High density residential
        }

        if (finalDensity > 0.05) {
            if (Math.abs(typeVal) < 0.1) return { type: 'water' }; // Rivers/Lakes
            if (typeVal > 0.4) return { type: 'industrial' };
            return { type: 'suburbs' };
        }

        return { type: 'outskirts' };
    }

    /**
     * Physics: Get Surface Height
     */
    getHeightAt(x, z) {
        // Fast lookup via spatial hash (grid coordinates)
        const gx = Math.round(x / this.gridStep);
        const gz = Math.round(z / this.gridStep);
        const key = `${gx},${gz}`;

        if (this.blockPolygons && this.blockPolygons.has(key)) {
            const block = this.blockPolygons.get(key);
            // Check Point in Polygon
            // Ray casting algorithm for convex quad
            let inside = false;
            const poly = block.poly;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i].x, yi = poly[i].z;
                const xj = poly[j].x, yj = poly[j].z;

                const intersect = ((yi > z) !== (yj > z)) &&
                    (x < (xj - xi) * (z - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            if (inside) return block.height;
        }

        return this.groundHeight;
    }

    /**
     * Physics: Get Normal
     */
    getNormalAt(x, z) {
        return new THREE.Vector3(0, 1, 0); // Simplified
    }

    /**
     * Update loop for animations/logic
     */
    update(playerPos, sky, deltaTime) {
        if (this.bulbMat && sky) {
            const isNight = sky.isNight ? sky.isNight() : false;

            // 1. Material Updates
            if (isNight) {
                this.bulbMat.color.setHex(0xffaa00);
                if (this.glowMat) this.glowMat.opacity = 0.8;
            } else {
                this.bulbMat.color.setHex(0x111111); // Dark grey (off)
                if (this.glowMat) this.glowMat.opacity = 0;
            }

            // 2. Dynamic Light Pooling
            if (isNight && playerPos && this.allLights.length > 0) {
                const px = playerPos.x;
                const pz = playerPos.z;
                const range = 250 * this.scale; // Check lights within range
                const rangeSq = range * range;

                // Simple distance filter
                const candidates = [];
                // Only check every Nth light or full check? 
                // Full check of ~2000 items is fast (approx 0.1ms).
                for (let i = 0; i < this.allLights.length; i++) {
                    const l = this.allLights[i];
                    const dx = l.x - px;
                    const dz = l.z - pz;
                    if (Math.abs(dx) > range || Math.abs(dz) > range) continue;

                    const distSq = dx * dx + dz * dz;
                    if (distSq < rangeSq) {
                        candidates.push({ light: l, distSq: distSq });
                    }
                }

                // Sort by distance to find closest
                candidates.sort((a, b) => a.distSq - b.distSq);

                // Assign pool lights to closest candidates
                const activeCount = Math.min(candidates.length, this.lightPoolSize);
                
                for (let i = 0; i < this.lightPoolSize; i++) {
                    const poolLight = this.lightPool[i];
                    if (i < activeCount) {
                        const target = candidates[i].light;
                        poolLight.position.set(target.x, target.y, target.z);
                        poolLight.visible = true;
                    } else {
                        poolLight.visible = false;
                    }
                }
            } else {
                // Day time or no player: Hide all lights
                for (let i = 0; i < this.lightPoolSize; i++) {
                    this.lightPool[i].visible = false;
                }
            }
        }
    }

    /**
     * Physics: Get Surface Type
     */
    getSurfaceType(x, z) {
        if (this.getHeightAt(x, z) > 0.1) {
            return SurfaceTypes.CONCRETE; // Sidewalk
        }
        return SurfaceTypes.TARMAC; // Road
    }

    /**
     * Visuals: Create Building Material with "Windows"
     */
    _createBuildingMaterial() {
        // Use a simple canvas texture for windows
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 128; // Taller for vertical windows
        const ctx = canvas.getContext('2d');

        // Background (Building Wall)
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, 64, 128);

        // Windows
        ctx.fillStyle = '#ffeedd'; // Warm light
        // Randomize lit windows
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 4; x++) {
                if (Math.random() > 0.4) {
                    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
                    // Draw window rect
                    ctx.fillRect(4 + x * 16, 4 + y * 8, 8, 4);
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;

        // Custom shader to handle world-space UV mapping (Triplanar-ish)
        // Or simpler: just use the texture with high repeat
        // Problem: Scaling geometry stretches texture. 
        // We will modify the material to scale UVs by world position in Vertex Shader

        const material = new THREE.MeshLambertMaterial({
            map: texture,
            color: 0xffffff
        });

        return material;
    }

    _createGlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 200, 100, 1)'); // Warm center
        gradient.addColorStop(0.4, 'rgba(255, 150, 0, 0.5)'); // Orange mid
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0)'); // Fade out
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }
}
