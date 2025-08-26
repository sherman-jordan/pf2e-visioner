/**
 * Auto-cover hooks registration
 * This file replaces the old auto-cover.js hooks file with a cleaner interface
 */

import { MODULE_ID } from '../constants.js';
import { AutoCoverHooks } from '../cover/auto-cover/AutoCoverHooks.js';

/**
 * Registers hooks for the new auto-cover system
 * Handles transition from old system to new system
 */
export function registerAutoCoverHooks() {
    console.debug(`${MODULE_ID} | Registering auto-cover hooks via new system`);

    // Check for existing old system hooks first
    if (window.pf2eVisionerTemplateData || window.pf2eVisionerActiveReflexSaves) {
        console.warn(`${MODULE_ID} | Detected existing auto-cover system data. The new system will coexist with the old system.`);
    }

    // Register our new hooks - the static method will prevent duplicate registrations
    AutoCoverHooks.registerHooks();

    // Store reference to our new hooks system for other modules
    if (!window.pf2eVisioner) window.pf2eVisioner = {};
    if (!window.pf2eVisioner.hooks) window.pf2eVisioner.hooks = {};
    window.pf2eVisioner.hooks.autoCover = {
        version: '2.0.0',
        system: 'new',
        registered: true,
        timestamp: Date.now()
    };
}
