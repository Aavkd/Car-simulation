import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Starfield Generator
 * Creates a realistic night sky with stars and Milky Way
 */
export class Starfield {
    constructor(scene) {
        this.scene = scene;
        this.starsGroup = new THREE.Group();
        this.starsGroup.name = 'starfield';
        
        // Milky Way GLB model
        this.milkyWayModel = null;
        
        this._createStars();
        this._createMilkyWay();
        this._createBrightStars();
        this._loadMilkyWayModel();
        
        this.scene.add(this.starsGroup);
        this.starsGroup.visible = false; // Hidden by default (daytime)
    }
    
    /**
     * Load the Milky Way GLB model
     */
    _loadMilkyWayModel() {
        const loader = new GLTFLoader();
        
        loader.load(
            'assets/models/milky_way.glb',
            (gltf) => {
                this.milkyWayModel = gltf.scene;
                
                // Position and scale the galaxy model to fit in the skybox
                // Keep it within the sky dome radius (~4000) but visible
                this.milkyWayModel.scale.setScalar(1000);
                this.milkyWayModel.position.set(0, -100, 0);
                
                // Rotate to align with the sky - tilt it to arc across the sky
                this.milkyWayModel.rotation.x = Math.PI * 0.3;
                this.milkyWayModel.rotation.z = Math.PI * 0.2;
                
                // Make the model emissive/glowing for night sky effect
                this.milkyWayModel.traverse((child) => {
                    if (child.isMesh) {
                        // Enable transparency and additive blending for glow effect
                        child.material = child.material.clone();
                        child.material.transparent = true;
                        child.material.opacity = 1.0;
                        child.material.blending = THREE.AdditiveBlending;
                        child.material.depthWrite = false;
                        child.material.side = THREE.DoubleSide;
                        
                        // Disable fog so the glow is visible at any distance
                        child.material.fog = false;
                        
                        // Disable distance-based attenuation
                        child.material.toneMapped = false;
                        
                        // Boost base color for more vibrancy
                        if (child.material.color) {
                            child.material.color.multiplyScalar(5.0);
                        }
                        
                        // Add strong emissive glow with colorful tint - high intensity for distance visibility
                        if (child.material.emissive) {
                            child.material.emissive = new THREE.Color(0xcc88ff); // Brighter purple-blue glow
                            child.material.emissiveIntensity = 24;
                        }
                        
                        // Increase material brightness for emissive maps
                        if (child.material.emissiveMap) {
                            child.material.emissiveIntensity = 10.0;
                        }
                    }
                });
                
                this.starsGroup.add(this.milkyWayModel);
                console.log('Milky Way GLB model loaded successfully');
            },
            (progress) => {
                // Loading progress
            },
            (error) => {
                console.warn('Could not load Milky Way GLB model:', error);
            }
        );
    }

    _createStars() {
        // Main star field - thousands of small stars
        const starCount = 15000;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);

        const colorPalette = [
            new THREE.Color(0xffffff), // White
            new THREE.Color(0xffeedd), // Warm white
            new THREE.Color(0xddddff), // Cool white
            new THREE.Color(0xffccaa), // Orange tint
            new THREE.Color(0xaaccff), // Blue tint
        ];

        for (let i = 0; i < starCount; i++) {
            // Distribute on a sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 4000 + Math.random() * 500;

            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);

            // Random star color
            const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            // Vary star sizes - most small, few larger
            sizes[i] = Math.random() < 0.95 ? 1.0 + Math.random() * 1.5 : 2.5 + Math.random() * 2.0;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Custom shader for stars with twinkling
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                opacity: { value: 1.0 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                varying float vSize;
                uniform float time;
                
                void main() {
                    vColor = color;
                    vSize = size;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vSize;
                uniform float time;
                uniform float opacity;
                
                void main() {
                    // Circular star shape
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    if (dist > 0.5) discard;
                    
                    // Soft glow
                    float intensity = 1.0 - smoothstep(0.0, 0.5, dist);
                    intensity = pow(intensity, 1.5);
                    
                    gl_FragColor = vec4(vColor * intensity, intensity * opacity);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.starsMesh = new THREE.Points(geometry, material);
        this.starsGroup.add(this.starsMesh);
    }

    _createBrightStars() {
        // Add some extra bright stars with glow
        const brightStarCount = 200;
        const positions = new Float32Array(brightStarCount * 3);
        const colors = new Float32Array(brightStarCount * 3);
        const sizes = new Float32Array(brightStarCount);

        const brightColors = [
            new THREE.Color(0xffffff),
            new THREE.Color(0xffffee),
            new THREE.Color(0xaaddff),
            new THREE.Color(0xffddaa),
        ];

        for (let i = 0; i < brightStarCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 3900;

            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);

            const color = brightColors[Math.floor(Math.random() * brightColors.length)];
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            sizes[i] = 4.0 + Math.random() * 4.0;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                opacity: { value: 1.0 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                varying float vSize;
                uniform float time;
                
                void main() {
                    vColor = color;
                    vSize = size;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    
                    // Twinkling effect
                    float twinkle = sin(time * 2.0 + position.x * 0.01) * 0.3 + 0.7;
                    gl_PointSize = size * twinkle * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vSize;
                uniform float opacity;
                
                void main() {
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    if (dist > 0.5) discard;
                    
                    // Stronger glow for bright stars
                    float intensity = 1.0 - smoothstep(0.0, 0.5, dist);
                    intensity = pow(intensity, 1.2);
                    
                    // Add subtle color bloom
                    vec3 glowColor = vColor + vec3(0.2);
                    
                    gl_FragColor = vec4(glowColor * intensity, intensity * opacity);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.brightStars = new THREE.Points(geometry, material);
        this.starsGroup.add(this.brightStars);
    }

    _createMilkyWay() {
        // Create Milky Way as a dense band of stars
        const milkyWayStars = 25000;
        const positions = new Float32Array(milkyWayStars * 3);
        const colors = new Float32Array(milkyWayStars * 3);
        const sizes = new Float32Array(milkyWayStars);

        // Milky Way colors - subtle purples, blues, and warm tones
        const milkyWayColors = [
            new THREE.Color(0x9999bb), // Dusty purple
            new THREE.Color(0xaaaacc), // Light purple
            new THREE.Color(0x8888aa), // Muted blue
            new THREE.Color(0xbbbbdd), // Pale lavender
            new THREE.Color(0xccccee), // Very light
            new THREE.Color(0xddccbb), // Warm dust
        ];

        for (let i = 0; i < milkyWayStars; i++) {
            // Create a band across the sky (tilted)
            const theta = Math.random() * Math.PI * 2;
            
            // Concentrate stars in a band with gaussian-like distribution
            const bandWidth = 0.3 + Math.random() * 0.2;
            const phi = Math.PI / 2 + (Math.random() - 0.5) * bandWidth * Math.PI;
            
            const radius = 3800 + Math.random() * 300;

            // Rotate the band for more natural look
            const tiltAngle = Math.PI * 0.15;
            
            let x = radius * Math.sin(phi) * Math.cos(theta);
            let y = radius * Math.sin(phi) * Math.sin(theta);
            let z = radius * Math.cos(phi);

            // Apply tilt rotation
            const cosT = Math.cos(tiltAngle);
            const sinT = Math.sin(tiltAngle);
            const newY = y * cosT - z * sinT;
            const newZ = y * sinT + z * cosT;

            positions[i * 3] = x;
            positions[i * 3 + 1] = newY;
            positions[i * 3 + 2] = newZ;

            // Milky way specific colors
            const color = milkyWayColors[Math.floor(Math.random() * milkyWayColors.length)];
            // Add some variation
            colors[i * 3] = color.r * (0.7 + Math.random() * 0.3);
            colors[i * 3 + 1] = color.g * (0.7 + Math.random() * 0.3);
            colors[i * 3 + 2] = color.b * (0.7 + Math.random() * 0.3);

            // Smaller sizes for milky way dust effect
            sizes[i] = 0.5 + Math.random() * 1.5;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                opacity: { value: 0.6 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                
                void main() {
                    vColor = color;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (200.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                uniform float opacity;
                
                void main() {
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    if (dist > 0.5) discard;
                    
                    // Soft, diffuse glow for dust effect
                    float intensity = 1.0 - smoothstep(0.0, 0.5, dist);
                    intensity = pow(intensity, 2.0);
                    
                    gl_FragColor = vec4(vColor * intensity, intensity * opacity * 0.5);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.milkyWay = new THREE.Points(geometry, material);
        this.starsGroup.add(this.milkyWay);

        // Add nebula clouds for extra detail
        this._createNebulaClouds();
    }

    _createNebulaClouds() {
        // Create subtle nebula/dust clouds in the Milky Way
        const cloudCount = 50;
        
        for (let i = 0; i < cloudCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.PI / 2 + (Math.random() - 0.5) * 0.4 * Math.PI;
            const radius = 3700;

            const tiltAngle = Math.PI * 0.15;
            
            let x = radius * Math.sin(phi) * Math.cos(theta);
            let y = radius * Math.sin(phi) * Math.sin(theta);
            let z = radius * Math.cos(phi);

            const cosT = Math.cos(tiltAngle);
            const sinT = Math.sin(tiltAngle);
            const newY = y * cosT - z * sinT;
            const newZ = y * sinT + z * cosT;

            // Create a sprite for each cloud
            const cloudColors = [0x6666aa, 0x8877aa, 0x7788bb, 0x9988aa];
            const color = cloudColors[Math.floor(Math.random() * cloudColors.length)];
            
            const spriteMaterial = new THREE.SpriteMaterial({
                color: color,
                transparent: true,
                opacity: 0.08 + Math.random() * 0.06,
                blending: THREE.AdditiveBlending
            });

            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.position.set(x, newY, newZ);
            sprite.scale.setScalar(200 + Math.random() * 300);
            
            this.starsGroup.add(sprite);
        }
    }

    update(time, visibility) {
        // Update star twinkling
        if (this.starsMesh && this.starsMesh.material.uniforms) {
            this.starsMesh.material.uniforms.time.value = time;
            this.starsMesh.material.uniforms.opacity.value = visibility;
        }
        if (this.brightStars && this.brightStars.material.uniforms) {
            this.brightStars.material.uniforms.time.value = time;
            this.brightStars.material.uniforms.opacity.value = visibility;
        }
        if (this.milkyWay && this.milkyWay.material.uniforms) {
            this.milkyWay.material.uniforms.opacity.value = visibility * 0.6;
        }
        
        // Update Milky Way GLB model opacity based on visibility
        if (this.milkyWayModel) {
            this.milkyWayModel.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material.opacity = visibility * 0.8;
                }
            });
            // Slow rotation for subtle animation
            this.milkyWayModel.rotation.y += 0.00005;
        }

        // Slowly rotate the starfield for subtle movement
        this.starsGroup.rotation.y += 0.00002;
    }

    setVisible(visible) {
        this.starsGroup.visible = visible;
    }
}
