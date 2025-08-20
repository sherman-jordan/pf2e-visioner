/**
 * Configuration for VisionerMultiTokenManager UI
 */

export const MULTI_TOKEN_MANAGER_DEFAULT_OPTIONS = {
  tag: "form",
  classes: ["pf2e-visioner", "multi-token-manager"],
  form: {
    handler: null, // to be assigned by the class
    submitOnChange: false,
    closeOnSubmit: false,
  },
  window: {
    title: "PF2E_VISIONER.MULTI_TOKEN_MANAGER.TITLE",
    icon: "fas fa-users-cog",
    resizable: true,
  },
  position: {
    width: 700,
    height: 750,
  },
      actions: {
      nextPage: null,
      previousPage: null,
      goToPage: null,
      toggleEncounterFilter: null,
      toggleObserverTarget: null,
      toggleTab: null,
      // New streamlined bulk actions
      selectVisibilityState: null,
      bulkApplyToTargets: null,
      bulkApplyDirectional: null,
      // Legacy bulk actions (keeping for compatibility)  
      bulkSetVisibility: null,
      bulkObservedFrom: null,
      bulkHiddenFrom: null,
      bulkUndetectedTo: null,
      bulkAllies: null,
      bulkEnemies: null,
      bulkAll: null,
      // Cover bulk actions
      bulkNoCover: null,
      bulkLesserCover: null,
      bulkStandardCover: null,
      bulkGreaterCover: null,
      // Final actions
      confirmChanges: null,
      applyAllChanges: null,
      cancel: null,
    },
};

export const MULTI_TOKEN_MANAGER_PARTS = {
  form: {
    template: "modules/pf2e-visioner/templates/multi-token-manager.hbs",
  },
};

// For production, switch back to the main template
export const MULTI_TOKEN_MANAGER_PARTS_PROD = {
  form: {
    template: "modules/pf2e-visioner/templates/multi-token-manager.hbs",
  },
};
