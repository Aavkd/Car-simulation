import * as THREE from 'three';
import { Starfield } from './starfield.js';

/**
 * Dynamic Sky System
 * Handles day/night cycle with realistic sky colors and celestial bodies
 */
export class SkySystem {
    constructor(scene) {
        this.scene = scene;
        
        // Time settings
        this.timeOfDay = 0.35; // 0-1, where 0.25 = sunrise, 0.5 = noon, 0.75 = sunset, 0 = midnight
        this.dayDuration = 600; // Seconds for a full day cycle (10 minutes)
        this.paused = false;
        
        // Sky dome
        this.skyDome = null;
        this.skyMaterial = null;
        
        // Celestial bodies
        this.sun = null;
        this.moon = null;
        this.sunLight = null;
        this.moonLight = null;
        this.ambientLight = null;
        this.hemiLight = null;
        
        // Starfield
        this.starfield = new Starfield(scene);
        
        // Internal time tracking
        this.elapsedTime = 0;
        
        this._createSkyDome();
        this._createCelestialBodies();
        this._createLighting();
        
        // Initial update
        this._updateSky();
    }

    _createSkyDome() {
        // Large sphere for sky gradient
        const geometry = new THREE.SphereGeometry(5000, 32, 32);
        
        this.skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                horizonColor: { value: new THREE.Color(0xffaa55) },
                sunPosition: { value: new THREE.Vector3(0, 1, 0) },
                sunColor: { value: new THREE.Color(0xffffcc) },
                timeOfDay: { value: 0.5 },
                starVisibility: { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec3 vPosition;
                
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform vec3 horizonColor;
                uniform vec3 sunPosition;
                uniform vec3 sunColor;
                uniform float timeOfDay;
                uniform float starVisibility;
                varying vec3 vWorldPosition;
                varying vec3 vPosition;
                
                void main() {
                    // Normalized height for gradient
                    float h = normalize(vPosition).y;
                    
                    // Sky gradient
                    vec3 skyColor;
                    if (h > 0.0) {
                        // Above horizon: blend from horizon to top
                        float t = pow(h, 0.5);
                        skyColor = mix(horizonColor, topColor, t);
                    } else {
                        // Below horizon: darker
                        skyColor = mix(horizonColor, bottomColor, -h * 2.0);
                    }
                    
                    // Sun glow
                    vec3 sunDir = normalize(sunPosition);
                    float sunDot = dot(normalize(vPosition), sunDir);
                    if (sunDot > 0.9995) {
                        // Sun disc
                        skyColor = sunColor * 2.0;
                    } else if (sunDot > 0.98) {
                        // Sun glow
                        float glowFactor = (sunDot - 0.98) / 0.02;
                        glowFactor = pow(glowFactor, 2.0);
                        skyColor = mix(skyColor, sunColor * 1.5, glowFactor * 0.8);
                    } else if (sunDot > 0.9) {
                        // Outer glow
                        float outerGlow = (sunDot - 0.9) / 0.08;
                        outerGlow = pow(outerGlow, 3.0);
                        skyColor = mix(skyColor, sunColor, outerGlow * 0.3);
                    }
                    
                    gl_FragColor = vec4(skyColor, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false
        });

        this.skyDome = new THREE.Mesh(geometry, this.skyMaterial);
        this.scene.add(this.skyDome);
    }

    _createCelestialBodies() {
        // Create sun sprite
        const sunTexture = this._createSunTexture();
        const sunMaterial = new THREE.SpriteMaterial({
            map: sunTexture,
            color: 0xffffee,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        this.sun = new THREE.Sprite(sunMaterial);
        this.sun.scale.setScalar(400);
        this.scene.add(this.sun);

        // Create moon
        const moonTexture = this._createMoonTexture();
        const moonMaterial = new THREE.SpriteMaterial({
            map: moonTexture,
            color: 0xeeeeff,
            transparent: true
        });
        this.moon = new THREE.Sprite(moonMaterial);
        this.moon.scale.setScalar(200);
        this.scene.add(this.moon);
    }

    _createSunTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Radial gradient for sun
        const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
        gradient.addColorStop(0.2, 'rgba(255, 255, 150, 0.9)');
        gradient.addColorStop(0.4, 'rgba(255, 220, 100, 0.5)');
        gradient.addColorStop(0.7, 'rgba(255, 180, 50, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 150, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    _createMoonTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Moon base
        const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 100);
        gradient.addColorStop(0, 'rgba(240, 240, 255, 1)');
        gradient.addColorStop(0.5, 'rgba(220, 220, 240, 1)');
        gradient.addColorStop(0.8, 'rgba(180, 180, 210, 0.8)');
        gradient.addColorStop(1, 'rgba(150, 150, 180, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);

        // Add some crater details
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 8; i++) {
            const x = 80 + Math.random() * 96;
            const y = 80 + Math.random() * 96;
            const r = 5 + Math.random() * 15;
            
            const craterGradient = ctx.createRadialGradient(x, y, 0, x, y, r);
            craterGradient.addColorStop(0, 'rgba(120, 120, 140, 0.5)');
            craterGradient.addColorStop(1, 'rgba(180, 180, 200, 0)');
            
            ctx.fillStyle = craterGradient;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    _createLighting() {
        // Main directional light (sun)
        this.sunLight = new THREE.DirectionalLight(0xffffee, 1.5);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 10;
        this.sunLight.shadow.camera.far = 500;
        this.sunLight.shadow.camera.left = -100;
        this.sunLight.shadow.camera.right = 100;
        this.sunLight.shadow.camera.top = 100;
        this.sunLight.shadow.camera.bottom = -100;
        this.sunLight.shadow.bias = -0.0005;
        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);

        // Moon light (dimmer, blue tint)
        this.moonLight = new THREE.DirectionalLight(0x8899bb, 0.3);
        this.moonLight.castShadow = false;
        this.scene.add(this.moonLight);

        // Ambient light
        this.ambientLight = new THREE.AmbientLight(0x404060, 0.3);
        this.scene.add(this.ambientLight);

        // Hemisphere light
        this.hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3d5c3d, 0.5);
        this.scene.add(this.hemiLight);
    }

    _updateSky() {
        // Calculate sun angle (0 = midnight, 0.5 = noon)
        const sunAngle = (this.timeOfDay - 0.25) * Math.PI * 2; // Offset so 0.5 = noon (sun at top)
        const sunHeight = Math.sin(sunAngle);
        const sunHorizontal = Math.cos(sunAngle);

        // Sun position
        const sunDistance = 3000;
        const sunX = sunHorizontal * sunDistance;
        const sunY = sunHeight * sunDistance;
        const sunZ = 0;

        this.sun.position.set(sunX, sunY, sunZ);
        
        // Moon is opposite to sun
        this.moon.position.set(-sunX, -sunY, -sunZ);

        // Update sun light position
        this.sunLight.position.set(sunX * 0.1, sunY * 0.1, sunZ);
        
        // Update moon light position
        this.moonLight.position.set(-sunX * 0.1, -sunY * 0.1, -sunZ);

        // Calculate day/night blend factor
        // 1 = full day, 0 = full night
        const dayFactor = Math.max(0, Math.min(1, (sunHeight + 0.2) / 0.6));
        const nightFactor = 1 - dayFactor;

        // Sky colors based on time
        const skyColors = this._calculateSkyColors(sunHeight, dayFactor);
        
        this.skyMaterial.uniforms.topColor.value.copy(skyColors.top);
        this.skyMaterial.uniforms.bottomColor.value.copy(skyColors.bottom);
        this.skyMaterial.uniforms.horizonColor.value.copy(skyColors.horizon);
        this.skyMaterial.uniforms.sunPosition.value.set(sunX, sunY, sunZ).normalize();
        this.skyMaterial.uniforms.sunColor.value.copy(skyColors.sunGlow);
        this.skyMaterial.uniforms.timeOfDay.value = this.timeOfDay;

        // Update lighting intensities
        this._updateLighting(sunHeight, dayFactor, nightFactor);

        // Update fog color
        if (this.scene.fog) {
            this.scene.fog.color.copy(skyColors.horizon);
        }

        // Update starfield visibility
        const starVisibility = Math.max(0, nightFactor - 0.3) / 0.7;
        this.starfield.setVisible(starVisibility > 0.05);
        this.starfield.update(this.elapsedTime, starVisibility);

        // Sun/Moon visibility
        this.sun.visible = sunHeight > -0.3;
        this.sun.material.opacity = Math.max(0, Math.min(1, (sunHeight + 0.3) / 0.5));
        
        this.moon.visible = sunHeight < 0.3;
        this.moon.material.opacity = Math.max(0, Math.min(1, (-sunHeight + 0.3) / 0.5));
    }

    _calculateSkyColors(sunHeight, dayFactor) {
        const colors = {
            top: new THREE.Color(),
            bottom: new THREE.Color(),
            horizon: new THREE.Color(),
            sunGlow: new THREE.Color()
        };

        if (sunHeight > 0.3) {
            // Midday - bright blue sky
            colors.top.setHex(0x1e90ff);
            colors.horizon.setHex(0x87CEEB);
            colors.bottom.setHex(0xadd8e6);
            colors.sunGlow.setHex(0xffffdd);
        } else if (sunHeight > 0.0) {
            // Morning/evening transition
            const t = sunHeight / 0.3;
            
            colors.top.setHex(0x1e90ff).lerp(new THREE.Color(0xff8844), 1 - t);
            colors.horizon.setHex(0x87CEEB).lerp(new THREE.Color(0xff6633), 1 - t);
            colors.bottom.setHex(0xadd8e6).lerp(new THREE.Color(0xffaa66), 1 - t);
            colors.sunGlow.setHex(0xffffdd).lerp(new THREE.Color(0xff9944), 1 - t);
        } else if (sunHeight > -0.2) {
            // Sunset/sunrise (golden hour)
            const t = (sunHeight + 0.2) / 0.2;
            
            colors.top.setHex(0xff8844).lerp(new THREE.Color(0x2a1a4a), 1 - t);
            colors.horizon.setHex(0xff6633).lerp(new THREE.Color(0x4a2a5a), 1 - t);
            colors.bottom.setHex(0xffaa66).lerp(new THREE.Color(0x1a0a2a), 1 - t);
            colors.sunGlow.setHex(0xff9944).lerp(new THREE.Color(0xff4400), 1 - t);
        } else if (sunHeight > -0.4) {
            // Twilight
            const t = (sunHeight + 0.4) / 0.2;
            
            colors.top.setHex(0x2a1a4a).lerp(new THREE.Color(0x151530), 1 - t);
            colors.horizon.setHex(0x4a2a5a).lerp(new THREE.Color(0x252545), 1 - t);
            colors.bottom.setHex(0x1a0a2a).lerp(new THREE.Color(0x101025), 1 - t);
            colors.sunGlow.setHex(0xff4400).lerp(new THREE.Color(0x220000), 1 - t);
        } else {
            // Night - brighter/clearer
            colors.top.setHex(0x151530);
            colors.horizon.setHex(0x252545);
            colors.bottom.setHex(0x101025);
            colors.sunGlow.setHex(0x220000);
        }

        return colors;
    }

    _updateLighting(sunHeight, dayFactor, nightFactor) {
        // Sun light
        const sunIntensity = Math.max(0, sunHeight) * 1.8;
        this.sunLight.intensity = sunIntensity;
        
        // Sun color shifts to orange at sunrise/sunset
        if (sunHeight > 0.3) {
            this.sunLight.color.setHex(0xffffee);
        } else if (sunHeight > 0) {
            this.sunLight.color.setHex(0xffddaa);
        } else {
            this.sunLight.color.setHex(0xff8855);
        }

        // Moon light
        const moonIntensity = Math.max(0, -sunHeight) * 0.8;
        this.moonLight.intensity = moonIntensity;

        // Ambient light - always present but varies
        const ambientIntensity = 0.25 + dayFactor * 0.35;
        this.ambientLight.intensity = ambientIntensity;
        
        // Ambient color shifts
        if (dayFactor > 0.5) {
            this.ambientLight.color.setHex(0x6699cc);
        } else if (dayFactor > 0.2) {
            this.ambientLight.color.lerpColors(
                new THREE.Color(0x6699cc),
                new THREE.Color(0x5a4a6a),
                1 - (dayFactor - 0.2) / 0.3
            );
        } else {
            this.ambientLight.color.setHex(0x4a4a6a);
        }

        // Hemisphere light
        this.hemiLight.intensity = 0.2 + dayFactor * 0.5;
        
        if (dayFactor > 0.5) {
            this.hemiLight.color.setHex(0x87CEEB);
            this.hemiLight.groundColor.setHex(0x3d5c3d);
        } else {
            this.hemiLight.color.lerpColors(
                new THREE.Color(0x87CEEB),
                new THREE.Color(0x1a1a3a),
                1 - dayFactor
            );
            this.hemiLight.groundColor.lerpColors(
                new THREE.Color(0x3d5c3d),
                new THREE.Color(0x1a2a1a),
                1 - dayFactor
            );
        }
    }

    /**
     * Update the sky system
     * @param {number} deltaTime - Time since last frame in seconds
     * @param {THREE.Vector3} cameraPosition - Current camera position for sky dome centering
     */
    update(deltaTime, cameraPosition) {
        if (!this.paused) {
            this.elapsedTime += deltaTime;
            this.timeOfDay += deltaTime / this.dayDuration;
            if (this.timeOfDay >= 1) this.timeOfDay -= 1;
        }

        // Keep sky dome centered on camera
        if (cameraPosition) {
            this.skyDome.position.copy(cameraPosition);
        }

        this._updateSky();
    }

    /**
     * Set time of day directly
     * @param {number} time - Time from 0-1 (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset)
     */
    setTime(time) {
        this.timeOfDay = time % 1;
        this._updateSky();
    }

    /**
     * Set the duration of a full day cycle
     * @param {number} seconds - Duration in seconds
     */
    setDayDuration(seconds) {
        this.dayDuration = seconds;
    }

    /**
     * Pause or unpause the day/night cycle
     * @param {boolean} paused 
     */
    setPaused(paused) {
        this.paused = paused;
    }

    /**
     * Get the main sun directional light for shadow following
     * @returns {THREE.DirectionalLight}
     */
    getSunLight() {
        return this.sunLight;
    }

    /**
     * Get current time of day
     * @returns {number} Time from 0-1
     */
    getTime() {
        return this.timeOfDay;
    }

    /**
     * Get formatted time string (e.g., "14:30")
     * @returns {string}
     */
    getTimeString() {
        const hours = Math.floor(this.timeOfDay * 24);
        const minutes = Math.floor((this.timeOfDay * 24 - hours) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * Check if it's currently night time
     * @returns {boolean}
     */
    isNight() {
        const sunAngle = (this.timeOfDay - 0.25) * Math.PI * 2;
        return Math.sin(sunAngle) < -0.1;
    }
}
