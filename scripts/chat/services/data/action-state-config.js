// Centralized mapping of desired override states per action type
import { MODULE_ID } from "../../../constants.js";

export function getDesiredOverrideStatesForAction(actionType) {
  switch (actionType) {
    case "seek":
      return ["observed","hidden"];
    case "hide":
      return ["observed", "concealed", "hidden"];
    case "sneak":
      return ["observed", "hidden", "undetected"];
    case "create-a-diversion":
      return ["observed", "hidden"];
    case "point-out":
      return ["hidden"];
    case "consequences":
      return ["observed", "concealed", "hidden", "undetected"];
    default:
      return ["observed", "concealed", "hidden", "undetected"];
  }
}

// Default outcome → newVisibility mapping per action.
// Keys are action types; per action, keys are old visibility; per old visibility,
// keys are outcome levels mapped to the default new state.
export function getDefaultOutcomeMapping() {
  const sneakRawEnforcement = game.settings.get(MODULE_ID, "sneakRawEnforcement");
  
  const sneakMapping = sneakRawEnforcement
    ? {
        observed: { "critical-success": "observed", success: "observed", failure: "observed", "critical-failure": "observed" },
        concealed: { "critical-success": "concealed", success: "concealed", failure: "concealed", "critical-failure": "concealed" },
        hidden: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "observed" },
        undetected: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "observed" },
      }
    : {
        observed: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "observed" },
        concealed: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "concealed" },
        hidden: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "observed" },
        undetected: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "observed" },
      };

  return {
    seek: {
      observed: { "critical-success": "observed", success: "observed", failure: "observed", "critical-failure": "observed" },
      concealed: { "critical-success": "concealed", success: "concealed", failure: "concealed", "critical-failure": "concealed" },
      hidden: { "critical-success": "observed", success: "observed", failure: "hidden", "critical-failure": "hidden" },
      undetected: { "critical-success": "observed", success: "hidden", failure: "undetected", "critical-failure": "undetected" },
    },
    hide: {
      observed: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
      concealed: { "critical-success": "hidden", success: "hidden", failure: "concealed", "critical-failure": "concealed" },
      hidden: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
      undetected: { "critical-success": "undetected", success: "undetected", failure: "observed", "critical-failure": "observed" },
    },
    sneak: sneakMapping,
    "create-a-diversion": {
      observed: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
      concealed: { "critical-success": "hidden", success: "hidden", failure: "concealed", "critical-failure": "concealed" },
      hidden: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
      undetected: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
    },
    // Point Out defines its own observer/target mapping; leave empty for now
    "point-out": {
      observed: { "critical-success": "hidden", success: "hidden", failure: "hidden", "critical-failure": "hidden" },
      concealed: { "critical-success": "hidden", success: "hidden", failure: "hidden", "critical-failure": "hidden" },
      hidden: { "critical-success": "hidden", success: "hidden", failure: "hidden", "critical-failure": "hidden" },
      undetected: { "critical-success": "hidden", success: "hidden", failure: "hidden", "critical-failure": "hidden" },
    },
    consequences: {
      hidden: { "critical-success": "observed", success: "observed", failure: "observed", "critical-failure": "observed" },
      undetected: { "critical-success": "observed", success: "observed", failure: "observed", "critical-failure": "observed" },
    },
  };
}

export function getDefaultNewStateFor(actionType, oldState, outcomeLevel) {

  
  const map = getDefaultOutcomeMapping()[actionType];
  if (!map) {
    return null;
  }
  
  const old = map[oldState];
  if (!old) {
    return null;
  }
  
  const result = old[outcomeLevel] || null;
  return result;
}



