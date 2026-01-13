import * as THREE from 'three';
import { SkySystem } from './sky.js';

/**
 * Sky Atmosphere Transition System
 * 
 * Extends the full SkySystem (with day/night cycle, sun, moon, etc.)
 * and adds a space transition effect at high altitudes.
 * 
 * At ground level: Full SkySystem with day/night cycle
 * At high altitude: Fades to deep space (black with visible stars)
 */
export class SkyAtmosphereTransition extends SkySystem {
    constructor(scene) {
        super(scene);

        // Altitude thresholds for transition
        this.atmosphereStartAlt = 1000;   // Start fading atmosphere
        this.atmosphereEndAlt = 8000;     // Fully in space

        // Current transition factor (0 = ground/atmosphere, 1 = full space)
        this.transitionFactor = 0;

        // Store current camera altitude
        this.currentAltitude = 0;

        // Space colors to blend toward
        this.spaceColors = {
            top: new THREE.Color(0x000000),
            horizon: new THREE.Color(0x000005),
            bottom: new THREE.Color(0x000000)
        };

        // Store original sky uniforms for blending
        this.originalColors = {
            top: new THREE.Color(),
            horizon: new THREE.Color(),
            bottom: new THREE.Color()
        };
    }

    /**
     * Update the sky system with altitude-based transition
     * @param {number} deltaTime - Time since last frame in seconds
     * @param {THREE.Vector3} cameraPosition - Current camera position for sky dome centering
     */
    update(deltaTime, cameraPosition) {
        // First, run the parent update for full day/night cycle
        super.update(deltaTime, cameraPosition);

        // Then apply altitude-based transition
        if (cameraPosition) {
            this.currentAltitude = cameraPosition.y;

            // Override Northern Lights positioning
            // Keep them anchored to the atmosphere layer (don't follow player up into space)
            if (this.northernLights && this.northernLights.getGroup()) {
                const group = this.northernLights.getGroup();
                // Keep centered horizontally on player, but vertically on ground
                group.position.set(cameraPosition.x, 0, cameraPosition.z);
            }

            this._applyAltitudeTransition();
        }
    }

    /**
     * Apply altitude-based blending from atmosphere to space
     */
    _applyAltitudeTransition() {
        // Calculate transition factor based on altitude
        if (this.currentAltitude <= this.atmosphereStartAlt) {
            this.transitionFactor = 0;
        } else if (this.currentAltitude >= this.atmosphereEndAlt) {
            this.transitionFactor = 1;
        } else {
            // Smooth transition using smoothstep
            const t = (this.currentAltitude - this.atmosphereStartAlt) /
                (this.atmosphereEndAlt - this.atmosphereStartAlt);
            this.transitionFactor = t * t * (3 - 2 * t); // Smoothstep
        }

        // 1. BLEND SKY COLORS
        if (this.skyMaterial && this.skyMaterial.uniforms) {
            const uniforms = this.skyMaterial.uniforms;

            if (this.transitionFactor > 0) {
                // Blend toward space colors
                // Note: We are blending FROM whatever super.update() set (Atmosphere) TO Space
                uniforms.topColor.value.lerp(this.spaceColors.top, this.transitionFactor);
                uniforms.horizonColor.value.lerp(this.spaceColors.horizon, this.transitionFactor);
                uniforms.bottomColor.value.lerp(this.spaceColors.bottom, this.transitionFactor);

                // Fade out fog
                if (this.scene.fog && this.scene.fog.color) {
                    // Blend fog to black in space
                    this.scene.fog.color.lerp(new THREE.Color(0x000000), this.transitionFactor * 0.9);
                }
            }
        }

        // 2. STARFIELD VISIBILITY
        // Maximize visibility in space (High altitude = clear view of stars)
        if (this.transitionFactor > 0.1) {
            const spaceVisibility = Math.min(1.0, this.transitionFactor * 2.0);
            // Force visibility on
            this.starfield.setVisible(true);
            this.starfield.update(0, spaceVisibility);
            if (this.starfield.starsGroup) this.starfield.starsGroup.visible = true;
        }

        // 3. NORTHERN LIGHTS TRANSITION
        // Fade out northern lights as we leave atmosphere
        if (this.northernLights) {
            if (this.transitionFactor > 0) {
                // Reduce opacity based on transition
                const currentOpacity = this.northernLights.opacity;
                this.northernLights.opacity = currentOpacity * (1 - this.transitionFactor);

                // Force update shader
                if (this.northernLights.auroraMesh && this.northernLights.auroraMesh.material) {
                    this.northernLights.auroraMesh.material.uniforms.opacity.value = this.northernLights.opacity;
                }
            }
        }

        // 4. SUN & MOON TRANSITION
        // Transition visuals for space
        if (this.transitionFactor > 0) {
            // SUN: Transition from "Atmospheric Glow" to "Space Star"
            if (this.sun) {
                // Shrink Sun: Atmosphere (400) -> Space (150)
                const targetScale = 150;
                const currentScale = 400;
                const newScale = THREE.MathUtils.lerp(currentScale, targetScale, this.transitionFactor);
                this.sun.scale.setScalar(newScale);

                // Whiten Sun: Mood color -> Pure White
                const white = new THREE.Color(0xffffff);
                this.sun.material.color.lerp(white, this.transitionFactor);

                // Keep visible
                this.sun.material.opacity = 1.0;
            }

            // MOON: Remove atmospheric tint
            if (this.moon) {
                const white = new THREE.Color(0xffffff);
                this.moon.material.color.lerp(white, this.transitionFactor);
                this.moon.material.opacity = Math.max(this.moon.material.opacity, this.transitionFactor);
            }

            // LIGHTING: Dim slightly (no atmospheric bounce)
            const dimFactor = 1 - (this.transitionFactor * 0.3);
            if (this.sunLight) this.sunLight.intensity *= dimFactor;
            if (this.ambientLight) this.ambientLight.intensity *= dimFactor;
            if (this.hemiLight) this.hemiLight.intensity *= dimFactor;
        }
    }

    /**
     * Get current transition factor (0 = atmosphere, 1 = space)
     */
    getTransitionFactor() {
        return this.transitionFactor;
    }

    /**
     * Check if currently in space (above atmosphere)
     */
    isInSpace() {
        return this.transitionFactor > 0.9;
    }

    /**
     * Check if currently in atmosphere (on ground)
     */
    isInAtmosphere() {
        return this.transitionFactor < 0.1;
    }

    /**
     * Get current altitude
     */
    getAltitude() {
        return this.currentAltitude;
    }
}
