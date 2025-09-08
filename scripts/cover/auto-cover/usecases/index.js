/**
 * index.js
 * Exports all use case classes and singletons for auto-cover
 */

// Export singleton instances (default exports)
export { default as attackRollUseCase } from './AttackRollUseCase.js';
export { default as savingThrowUseCase } from './SavingThrowUseCase.js';
export { default as stealthCheckUseCase } from './StealthCheckUseCase.js';

// Export classes for reference (named exports)
export { AttackRollUseCase } from './AttackRollUseCase.js';
export { BaseAutoCoverUseCase as BaseUseCase } from './BaseUseCase.js';
export { SavingThrowUseCase } from './SavingThrowUseCase.js';
export { StealthCheckUseCase } from './StealthCheckUseCase.js';
