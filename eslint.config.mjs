import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        // Foundry VTT globals
        game: "readonly",
        canvas: "readonly",
        ui: "readonly",
        Hooks: "readonly",
        foundry: "readonly",
        CONFIG: "readonly",
        PIXI: "readonly",
        Handlebars: "readonly",
        libWrapper: "readonly",
        socketlib: "readonly",
        Dialog: "readonly",
        SettingsConfig: "readonly",
        Item: "readonly",
        // Module specific
        MODULE_ID: "readonly",
        isStandard: "readonly",
        isDoor: "readonly",
        // Additional Foundry VTT globals
        MeasuredTemplate: "readonly",
        fromUuidSync: "readonly",
        context: "readonly",
        $: "readonly", // jQuery
        // Batch functions
        batchUpdateOffGuardEffects: "readonly",
        cleanupCoverEffectsForObserver: "readonly", 
        cleanupOffGuardEffectsForTarget: "readonly",
        // Test mock functions
        createMockToken: "readonly",
        createMockActor: "readonly",
        createMockWall: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "no-empty": "off", // Common in Foundry VTT modules for try/catch blocks
      "no-useless-catch": "off", // Common pattern in Foundry VTT for error handling
      "no-constant-binary-expression": "off", // Sometimes used intentionally in Foundry VTT
      "no-debugger": "off" // Sometimes used intentionally in Foundry VTT
    }
  }
];
