/**
 * Auto-cover hooks registration
 */

import { MODULE_ID } from '../constants.js';
import { AutoCoverHooks } from '../cover/auto-cover/AutoCoverHooks.js';

/**
 * Registers hooks for the new auto-cover system
 * Handles transition from old system to new system
 */
export function registerAutoCoverHooks() {
    console.debug(`${MODULE_ID} | Registering auto-cover hooks via new system`);

    // Register our new hooks - the static method will prevent duplicate registrations
    AutoCoverHooks.registerHooks();
}
