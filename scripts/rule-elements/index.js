/**
 * PF2E Visioner - Rule Elements Index
 * This file handles the registration of custom rule elements
 */

import { api } from '../api.js';

// Map to store recent changes to prevent loops
const recentChanges = new Map();

/**
 * Initialize and register custom rule elements
 */
export function initializeRuleElements() {
  Hooks.once('ready', registerRuleElements);
}

/**
 * Register rule elements with PF2e system
 */
function registerRuleElements() {
  if (!game.pf2e?.RuleElement) {
    console.error('PF2E Visioner | PF2e system not ready, rule elements not registered');
    return;
  }
  
  try {
    console.log('PF2E Visioner | Registering rule elements with PF2e system');
    
    // Create the rule element class
    const VisibilityRuleElement = createVisibilityRuleElement(
      game.pf2e.RuleElement,
      foundry.data.fields
    );
    
    if (!VisibilityRuleElement) return;
    
    // Register with PF2e
    game.pf2e.RuleElements.custom.Visibility = VisibilityRuleElement;
    
    // Add to UI dropdown
    if (CONFIG.PF2E?.ruleElementTypes) {
      CONFIG.PF2E.ruleElementTypes.Visibility = "Visibility";
    }
    
    // Add translations
    if (game.i18n) {
      const key = "PF2E.RuleElement.Visibility";
      if (!game.i18n.has(key)) {
        game.i18n.translations.PF2E = game.i18n.translations.PF2E || {};
        game.i18n.translations.PF2E.RuleElement = game.i18n.translations.PF2E.RuleElement || {};
        game.i18n.translations.PF2E.RuleElement.Visibility = "Visibility";
      }
    }
    
    // Add global test function
    if (window.PF2EVisioner) {
      window.PF2EVisioner.createVisibilityRuleElementExample = createVisibilityRuleElementExample;
    }
    
    console.log('PF2E Visioner | Rule elements registered successfully');
  } catch (error) {
    console.error('PF2E Visioner | Error registering rule elements:', error);
  }
}

/**
 * Factory function to create the VisibilityRuleElement class
 */
function createVisibilityRuleElement(baseRuleElementClass, fields) {
  if (!baseRuleElementClass || !fields) {
    console.error('PF2E Visioner | Missing dependencies for VisibilityRuleElement creation');
    return null;
  }

  return class VisibilityRuleElement extends baseRuleElementClass {
    // Static properties for documentation
    static get name() { return "Visibility"; }
    static get documentation() { return "https://github.com/roileaf/pf2e-visioner/blob/main/RULE_ELEMENTS.md#visibility-rule-element"; }
    static get description() { return "Change visibility statuses and apply ephemeral effects programmatically"; }
    static get defaultKey() { return "Visibility"; }
    
    // Define the schema
    static defineSchema() {
      const schema = super.defineSchema();
      
      schema.subject = new fields.StringField({
        required: true,
        choices: ["self", "target"],
        initial: "self",
        label: "Subject"
      });
      
      schema.observers = new fields.StringField({
        required: true,
        choices: ["all", "allies", "enemies", "selected"],
        initial: "all",
        label: "Observers"
      });
      
      schema.direction = new fields.StringField({
        required: false,
        choices: ["from", "to"],
        initial: "from",
        label: "Direction"
      });
      
      schema.mode = new fields.StringField({
        required: true,
        choices: ["set", "increase", "decrease"],
        initial: "set",
        label: "Mode"
      });
      
      schema.status = new fields.StringField({
        required: true,
        choices: ["observed", "concealed", "hidden", "undetected"],
        initial: "hidden",
        label: "Status"
      });
      
      schema.steps = new fields.NumberField({
        required: false,
        initial: 1,
        label: "Steps"
      });
      
      schema.applyEphemeralEffects = new fields.BooleanField({
        required: false,
        initial: true,
        label: "Apply Effects"
      });
      
      schema.durationRounds = new fields.NumberField({
        required: false,
        nullable: true,
        initial: null,
        label: "Duration (Rounds)"
      });
      
      schema.requiresInitiative = new fields.BooleanField({
        required: false,
        initial: false,
        label: "Requires Initiative"
      });
      
      schema.range = new fields.NumberField({
        required: false,
        nullable: true,
        initial: null,
        label: "Range (feet)"
      });
      
      return schema;
    }
    
    // Lifecycle hooks
    onCreate(actorUpdates) { this.applyVisibilityChange(); }
    onDelete(actorUpdates) { this.resetVisibility(); }
    beforeRoll(domains, rollOptions) {
      if (domains.includes("attack-roll")) this.addRollOptions(rollOptions);
    }
    afterRoll({ roll, domains }) {
      if (domains.includes("attack-roll")) this.applyVisibilityChange();
    }
    onUpdateEncounter({ event }) {
      if (event === "turn-start") this.applyVisibilityChange();
    }
    
    /**
     * Apply visibility changes based on rule element configuration
     */
    async applyVisibilityChange() {
      if (!api) return;
      
      // Get the tokens based on direction
      const { sourceTokens, targetTokens } = this.getDirectionalTokens();
      if (!sourceTokens.length || !targetTokens.length) return;
      
      // Process each token pair
      for (const sourceToken of sourceTokens) {
        for (const targetToken of targetTokens) {
          // Skip if same token
          if (sourceToken.id === targetToken.id) continue;
          
          // Determine observer and subject based on direction
          // For "from": observer sees subject
          // For "to": subject sees observer
          const [observerToken, subjectToken] = this.direction === "from" 
            ? [sourceToken, targetToken] 
            : [targetToken, sourceToken];
          
          // Get current visibility
          const currentVisibility = api.getVisibility(observerToken.id, subjectToken.id) || "observed";
          
          // Calculate new visibility
          const newVisibility = this.calculateNewVisibility(currentVisibility);
          
          // Skip if no change
          if (currentVisibility === newVisibility) continue;
          
          // Check for recent changes to prevent loops
          const key = `${observerToken.id}-${subjectToken.id}`;
          const now = game.time.worldTime;
          const lastChange = recentChanges.get(key);
          
          if (lastChange && (now - lastChange) < 1) {
            console.log(`PF2E Visioner | Skipping too frequent visibility change for ${observerToken.name} -> ${subjectToken.name}`);
            continue;
          }
          
          // Record this change
          recentChanges.set(key, now);
          
          // Apply visibility change
          await api.setVisibility(
            observerToken.id,
            subjectToken.id,
            newVisibility,
            { skipEphemeralUpdate: !this.applyEphemeralEffects }
          );
          
          // No ephemeral effects should be applied - the visibility state itself provides the mechanical benefits
          // This comment is left here to document that this was intentionally removed
        }
      }
    }
    
    /**
     * Get tokens based on direction setting
     * Returns { sourceTokens, targetTokens } where:
     * - For "from" direction: sourceTokens are observers, targetTokens are subjects
     * - For "to" direction: sourceTokens are subjects, targetTokens are observers
     */
    getDirectionalTokens() {
      let sourceTokens = [];
      let targetTokens = [];
      
      // Get the primary token (self or target)
      const primaryToken = this.subject === "self" 
        ? this.actor.getActiveTokens()[0]
        : game.user.targets.first();
      
      if (!primaryToken) {
        return { sourceTokens: [], targetTokens: [] };
      }
      
      // Get all potential tokens based on observers setting
      const allTokens = canvas.tokens?.placeables.filter(t => t.actor && t.id !== primaryToken.id) || [];
      let observerTokens = [];
      
      switch (this.observers) {
        case "all":
          observerTokens = allTokens;
          break;
        case "allies":
          observerTokens = allTokens.filter(t => this.areAllies(primaryToken.actor, t.actor));
          break;
        case "enemies":
          observerTokens = allTokens.filter(t => !this.areAllies(primaryToken.actor, t.actor));
          break;
        case "selected":
          observerTokens = canvas.tokens?.controlled.filter(t => t.id !== primaryToken.id) || [];
          break;
      }
      
      // Filter by range if needed
      if (this.range) {
        observerTokens = observerTokens.filter(token => {
          const distance = canvas.grid.measureDistance(primaryToken, token);
          return distance <= this.range;
        });
      }
      
      // Assign tokens based on direction
      if (this.direction === "from") {
        // "from" means the subject is hidden FROM the observers
        // So observers see the subject
        sourceTokens = observerTokens;
        targetTokens = [primaryToken];
      } else {
        // "to" means the subject is hidden TO the observers
        // So subject sees the observers
        sourceTokens = [primaryToken];
        targetTokens = observerTokens;
      }
      
      return { sourceTokens, targetTokens };
    }
    
    /**
     * Calculate new visibility based on mode
     */
    calculateNewVisibility(currentVisibility) {
      // Visibility progression from most to least visible
      const states = ["observed", "concealed", "hidden", "undetected"];
      const currentIndex = states.indexOf(currentVisibility);
      const steps = Math.min(this.steps || 1, states.length - 1);
      
      switch (this.mode) {
        case "set":
          return this.status;
          
        case "increase": // Less visible (move right in array)
          return states[Math.min(currentIndex + steps, states.length - 1)];
          
        case "decrease": // More visible (move left in array)
          return states[Math.max(currentIndex - steps, 0)];
          
        default:
          return currentVisibility;
      }
    }
    
    /**
     * Reset visibility to observed
     */
    async resetVisibility() {
      if (!api) return;
      
      const { sourceTokens, targetTokens } = this.getDirectionalTokens();
      if (!sourceTokens.length || !targetTokens.length) return;
      
      for (const sourceToken of sourceTokens) {
        for (const targetToken of targetTokens) {
          if (sourceToken.id === targetToken.id) continue;
          
          const [observerToken, subjectToken] = this.direction === "from" 
            ? [sourceToken, targetToken] 
            : [targetToken, sourceToken];
          
          await api.setVisibility(
            observerToken.id,
            subjectToken.id,
            "observed",
            { skipEphemeralUpdate: !this.applyEphemeralEffects }
          );
          
          // No ephemeral effects should be applied - the visibility state itself provides the mechanical benefits
          // This comment is left here to document that this was intentionally removed
        }
      }
    }
    
    /**
     * Add roll options based on current visibility
     */
    addRollOptions(rollOptions) {
      if (!api) return;
      
      const { sourceTokens, targetTokens } = this.getDirectionalTokens();
      if (!sourceTokens.length || !targetTokens.length) return;
      
      for (const sourceToken of sourceTokens) {
        for (const targetToken of targetTokens) {
          if (sourceToken.id === targetToken.id) continue;
          
          const [observerToken, subjectToken] = this.direction === "from" 
            ? [sourceToken, targetToken] 
            : [targetToken, sourceToken];
          
          const currentVisibility = api.getVisibility(observerToken.id, subjectToken.id);
          if (!currentVisibility) continue;
          
          rollOptions.add(`visibility:${currentVisibility}`);
          rollOptions.add(`visibility:direction:${this.direction}`);
          
          if (this.areAllies(subjectToken.actor, observerToken.actor)) {
            rollOptions.add(`visibility:ally:${currentVisibility}`);
          } else {
            rollOptions.add(`visibility:enemy:${currentVisibility}`);
          }
        }
      }
    }
    
    /**
     * Check if two actors are allies
     */
    areAllies(actor1, actor2) {
      if (!actor1 || !actor2) return false;
      
      const isPCvsPC = actor1.hasPlayerOwner && actor2.hasPlayerOwner;
      const isNPCvsNPC = !actor1.hasPlayerOwner && !actor2.hasPlayerOwner;
      const sameDisposition = actor1.token?.disposition === actor2.token?.disposition;
      
      return isPCvsPC || (isNPCvsNPC && sameDisposition);
    }
  };
}

/**
 * Create example items with the Visibility rule element
 */
async function createVisibilityRuleElementExample() {
  if (!game.pf2e?.RuleElements?.custom?.Visibility) {
    console.error("Visibility rule element is not registered yet!");
    return null;
  }
  
  // Example item data
  const examples = [
    {
      name: "Hide",
      img: "systems/pf2e/icons/spells/cloak-of-shadow.webp",
      description: "<p>You become hidden to all creatures.</p><p>Use this when you successfully Hide.</p>",
      rules: [
        {
          key: "Visibility",
          subject: "self",
          observers: "all",
          direction: "from",
          mode: "set",
          status: "hidden",
          applyEphemeralEffects: true,
          durationRounds: 10
        }
      ],
      traits: ["visual"]
    },
    {
      name: "Conceal Target",
      img: "systems/pf2e/icons/spells/obscuring-mist.webp",
      description: "<p>You magically conceal the target from all observers.</p>",
      rules: [
        {
          key: "Visibility",
          subject: "target",
          observers: "all",
          direction: "from",
          mode: "set",
          status: "concealed",
          applyEphemeralEffects: true,
          durationRounds: 10
        }
      ],
      traits: ["illusion", "magical"]
    },
    {
      name: "Obscuring Mist",
      img: "systems/pf2e/icons/spells/obscuring-mist.webp",
      description: "<p>You surround yourself with a mist that makes you harder to see.</p>",
      rules: [
        {
          key: "Visibility",
          subject: "self",
          observers: "all",
          direction: "from",
          mode: "increase",
          steps: 1,
          applyEphemeralEffects: true,
          durationRounds: 10
        }
      ],
      traits: ["conjuration", "water"]
    },
    {
      name: "Reveal",
      img: "systems/pf2e/icons/spells/true-seeing.webp",
      description: "<p>You reveal the target, making them easier to see.</p>",
      rules: [
        {
          key: "Visibility",
          subject: "target",
          observers: "all",
          direction: "from",
          mode: "decrease",
          steps: 1,
          applyEphemeralEffects: true,
          durationRounds: 10
        }
      ],
      traits: ["divination", "revelation"]
    },
    {
      name: "Enhanced Vision",
      img: "systems/pf2e/icons/spells/see-invisibility.webp",
      description: "<p>You can see hidden creatures better.</p>",
      rules: [
        {
          key: "Visibility",
          subject: "self",
          observers: "all",
          direction: "to",
          mode: "decrease",
          steps: 1,
          applyEphemeralEffects: true,
          durationRounds: 10
        }
      ],
      traits: ["divination", "detection"]
    },
    {
      name: "Blur Vision",
      img: "systems/pf2e/icons/spells/blur.webp",
      description: "<p>You blur the target's vision, making it harder for them to see others.</p>",
      rules: [
        {
          key: "Visibility",
          subject: "target",
          observers: "all",
          direction: "to",
          mode: "increase",
          steps: 1,
          applyEphemeralEffects: true,
          durationRounds: 10
        }
      ],
      traits: ["transmutation", "visual"]
    }
  ];
  
  try {
    const createdItems = [];
    
    // Create each example item
    for (const example of examples) {
      const itemData = {
        name: example.name,
        type: "effect",
        img: example.img,
        system: {
          description: { value: example.description },
          duration: { value: 1, unit: "minutes" },
          rules: example.rules,
          traits: { value: example.traits, rarity: "common" }
        }
      };
      
      const item = await Item.create(itemData);
      item.sheet.render(true);
      createdItems.push(item);
    }
    
    console.log("Example items created successfully!");
    return createdItems;
  } catch (error) {
    console.error("Error creating example items:", error);
    return null;
  }
}