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
export const DEFAULT_OUTCOME_MAPPING = {
  seek: {
    observed: { "critical-success": "observed", success: "observed", failure: "observed", "critical-failure": "observed" },
    concealed: { "critical-success": "observed", success: "concealed", failure: "concealed", "critical-failure": "concealed" },
    hidden: { "critical-success": "observed", success: "observed", failure: "hidden", "critical-failure": "hidden" },
    undetected: { "critical-success": "hidden", success: "hidden", failure: "undetected", "critical-failure": "undetected" },
  },
  hide: {
    observed: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
    concealed: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
    hidden: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
    undetected: { "critical-success": "undetected", success: "undetected", failure: "observed", "critical-failure": "observed" },
  },
  sneak: game.settings.get(MODULE_ID, "sneakRawEnforcement") ? {
    observed: { "critical-success": "observed", success: "observed", failure: "observed", "critical-failure": "observed" },
    concealed: { "critical-success": "concealed", success: "concealed", failure: "observed", "critical-failure": "observed" },
    hidden: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "observed" },
    undetected: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "observed" },
  }: {
    observed: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "observed" },
    concealed: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "observed" },
    hidden: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "observed" },
    undetected: { "critical-success": "undetected", success: "undetected", failure: "hidden", "critical-failure": "observed" },
  },
  "create-a-diversion": {
    observed: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
    concealed: { "critical-success": "hidden", success: "hidden", failure: "concealed", "critical-failure": "concealed" },
    hidden: { "critical-success": "hidden", success: "hidden", failure: "hidden", "critical-failure": "hidden" },
    undetected: { "critical-success": "undetected", success: "undetected", failure: "undetected", "critical-failure": "undetected" },
  },
  // Point Out defines its own observer/target mapping; leave empty for now
  "point-out": {},
  consequences: {
    hidden: { "critical-success": "observed", success: "observed", failure: "observed", "critical-failure": "observed" },
    undetected: { "critical-success": "observed", success: "observed", failure: "observed", "critical-failure": "observed" },
  },
};

export function getDefaultNewStateFor(actionType, oldState, outcomeLevel) {
  const map = DEFAULT_OUTCOME_MAPPING[actionType];
  if (!map) return null;
  const old = map[oldState];
  if (!old) return null;
  return old[outcomeLevel] || null;
}



