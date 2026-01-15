import * as THREE from 'three';
import { RagdollConfig } from './RagdollConfig.js';

/**
 * ImpactResponseSystem
 * 
 * Detects and categorizes impacts from various sources:
 * - Vehicle collisions
 * - NPC attacks / melee hits
 * - Environmental hazards (explosions, falls)
 * - Player-initiated pushes
 * 
 * The system maintains a buffer of recent impacts for:
 * - Cumulative force calculation (multiple hits = bigger reaction)
 * - Direction averaging (determines fall direction)
 * - Combo detection (rapid hits = special response)
 */
export class ImpactResponseSystem {
    /**
     * @param {Object} entity - The entity this system belongs to (player or NPC)
     * @param {Object} options - Configuration options
     */
    constructor(entity, options = {}) {
        this.entity = entity;
        this.enabled = true;

        // ==================== IMPACT BUFFER ====================
        this.recentImpacts = [];
        this.impactDecayTime = options.impactDecayTime || 0.5; // Seconds before impact "expires"
        this.maxBufferedImpacts = options.maxBufferedImpacts || 5;

        // ==================== CALLBACKS ====================
        this.onAbsorbed = options.onAbsorbed || null;
        this.onStumble = options.onStumble || null;
        this.onStagger = options.onStagger || null;
        this.onFall = options.onFall || null;
        this.onKnockdown = options.onKnockdown || null;

        // ==================== STATE ====================
        this.lastImpactSource = null;
        this.lastImpactDirection = new THREE.Vector3();
        this.lastImpactMagnitude = 0;
        this.lastResponse = 'none';

        // Cumulative tracking
        this.cumulativeDamage = 0;
        this.damageDecayRate = 50; // Units per second

        // Immunity frames (prevent impact spam)
        this.immunityTime = 0;
        this.immunityDuration = 0.1; // Seconds of immunity after major impact
    }

    /**
     * Register an impact event
     * @param {Object} impactData - Impact information
     * @param {THREE.Vector3} impactData.force - Force vector (direction * magnitude)
     * @param {THREE.Vector3} [impactData.point] - World position of impact
     * @param {string} [impactData.source] - Source identifier ('vehicle', 'melee', 'explosion', etc.)
     * @param {boolean} [impactData.ignoreImmunity] - Bypass immunity frames
     * @returns {string} Response type: 'absorbed', 'stumble', 'stagger', 'fall', 'knockdown'
     */
    registerImpact(impactData) {
        if (!this.enabled) return 'absorbed';

        const { force, point, source, ignoreImmunity } = impactData;

        // Check immunity
        if (!ignoreImmunity && this.immunityTime > 0) {
            return 'absorbed';
        }

        // Store impact in buffer
        const impact = {
            force: force.clone(),
            point: point ? point.clone() : null,
            source: source || 'unknown',
            time: performance.now(),
            magnitude: force.length()
        };

        this.recentImpacts.push(impact);

        // Limit buffer size
        while (this.recentImpacts.length > this.maxBufferedImpacts) {
            this.recentImpacts.shift();
        }

        // Update last impact tracking
        this.lastImpactSource = source;
        this.lastImpactDirection.copy(force).normalize();
        this.lastImpactMagnitude = force.length();

        // Calculate cumulative force from recent impacts
        const cumulativeForce = this._calculateCumulativeForce();

        // Add to cumulative damage tracker
        this.cumulativeDamage += force.length();

        // Determine response based on cumulative magnitude
        const response = this._categorizeImpact(cumulativeForce);
        this.lastResponse = response;

        // Apply immunity for significant impacts
        if (response !== 'absorbed') {
            this.immunityTime = this.immunityDuration;
        }

        // Trigger callbacks
        this._triggerResponse(response, impact);

        return response;
    }

    /**
     * Calculate cumulative force from recent impacts
     * Recent impacts contribute more, older ones decay
     */
    _calculateCumulativeForce() {
        const now = performance.now();
        let cumulativeForce = 0;

        this.recentImpacts.forEach(impact => {
            // Calculate age factor (1.0 for brand new, 0.0 for expired)
            const age = (now - impact.time) / 1000;
            const ageFactor = Math.max(0, 1 - age / this.impactDecayTime);

            // Newer impacts contribute more to cumulative force
            cumulativeForce += impact.magnitude * ageFactor;
        });

        return cumulativeForce;
    }

    /**
     * Categorize impact into response type
     * @param {number} magnitude - Force magnitude
     * @returns {string} Response type
     */
    _categorizeImpact(magnitude) {
        const t = RagdollConfig.impact;

        if (magnitude >= t.knockdownThreshold) return 'knockdown';
        if (magnitude >= t.fallThreshold) return 'fall';
        if (magnitude >= t.staggerThreshold) return 'stagger';
        if (magnitude >= t.stumbleThreshold) return 'stumble';
        return 'absorbed';
    }

    /**
     * Trigger the appropriate callback for a response
     */
    _triggerResponse(response, impact) {
        if (RagdollConfig.debug.logStateChanges) {
            console.log(`[ImpactResponseSystem] Response: ${response}, Source: ${impact.source}, Magnitude: ${impact.magnitude.toFixed(1)}`);
        }

        switch (response) {
            case 'absorbed':
                if (this.onAbsorbed) this.onAbsorbed(impact);
                break;
            case 'stumble':
                if (this.onStumble) this.onStumble(impact);
                break;
            case 'stagger':
                if (this.onStagger) this.onStagger(impact);
                break;
            case 'fall':
                if (this.onFall) this.onFall(impact);
                break;
            case 'knockdown':
                if (this.onKnockdown) this.onKnockdown(impact);
                break;
        }
    }

    /**
     * Get the average direction of recent impacts
     * Used to determine fall/stumble direction
     * @returns {THREE.Vector3} Normalized average direction
     */
    getImpactDirection() {
        if (this.recentImpacts.length === 0) {
            return new THREE.Vector3(0, 0, -1);
        }

        const now = performance.now();
        const dir = new THREE.Vector3();
        let totalWeight = 0;

        this.recentImpacts.forEach(impact => {
            // Weight by magnitude and recency
            const age = (now - impact.time) / 1000;
            const ageFactor = Math.max(0, 1 - age / this.impactDecayTime);
            const weight = impact.magnitude * ageFactor;

            dir.addScaledVector(impact.force.clone().normalize(), weight);
            totalWeight += weight;
        });

        if (totalWeight > 0) {
            dir.divideScalar(totalWeight);
        }

        // Ensure we return a valid normalized vector
        if (dir.lengthSq() < 0.001) {
            return new THREE.Vector3(0, 0, -1);
        }

        return dir.normalize();
    }

    /**
     * Get the horizontal component of impact direction (for ground-based reactions)
     * @returns {THREE.Vector3} Normalized horizontal direction
     */
    getHorizontalImpactDirection() {
        const dir = this.getImpactDirection();
        dir.y = 0;

        if (dir.lengthSq() < 0.001) {
            // If impact was purely vertical, use last horizontal direction
            return this.lastImpactDirection.clone().setY(0).normalize();
        }

        return dir.normalize();
    }

    /**
     * Check if there are any significant recent impacts
     * @returns {boolean} True if there are active impacts
     */
    hasActiveImpacts() {
        const now = performance.now();
        return this.recentImpacts.some(impact => {
            const age = (now - impact.time) / 1000;
            return age < this.impactDecayTime;
        });
    }

    /**
     * Get total magnitude of recent impacts
     * @returns {number} Cumulative magnitude
     */
    getTotalImpactMagnitude() {
        return this._calculateCumulativeForce();
    }

    /**
     * Main update loop - decay old impacts and immunity
     * @param {number} delta - Time delta in seconds
     */
    update(delta) {
        if (!this.enabled) return;

        // Decay immunity timer
        if (this.immunityTime > 0) {
            this.immunityTime = Math.max(0, this.immunityTime - delta);
        }

        // Decay cumulative damage
        this.cumulativeDamage = Math.max(0, this.cumulativeDamage - this.damageDecayRate * delta);

        // Prune expired impacts
        const now = performance.now();
        const expiryThreshold = this.impactDecayTime * 1000;

        this.recentImpacts = this.recentImpacts.filter(impact => {
            return (now - impact.time) < expiryThreshold;
        });
    }

    /**
     * Clear all tracked impacts
     */
    clearImpacts() {
        this.recentImpacts = [];
        this.cumulativeDamage = 0;
        this.lastResponse = 'none';
    }

    /**
     * Get current state for debugging/UI
     */
    getState() {
        return {
            activeImpacts: this.recentImpacts.length,
            cumulativeForce: this._calculateCumulativeForce(),
            cumulativeDamage: this.cumulativeDamage,
            lastResponse: this.lastResponse,
            lastSource: this.lastImpactSource,
            lastDirection: this.lastImpactDirection.clone(),
            isImmune: this.immunityTime > 0,
        };
    }

    /**
     * Enable/disable the system
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.clearImpacts();
        }
    }
}
