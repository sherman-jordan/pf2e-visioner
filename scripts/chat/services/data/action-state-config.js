// Centralized mapping of desired override states per action type

export function getDesiredOverrideStatesForAction(actionType, outcome) {
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
    concealed: { "critical-success": "observed", success: "observed", failure: "concealed", "critical-failure": "concealed" },
    hidden: { "critical-success": "observed", success: "observed", failure: "hidden", "critical-failure": "hidden" },
    undetected: { "critical-success": "hidden", success: "hidden", failure: "undetected", "critical-failure": "undetected" },
  },
  hide: {
    observed: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
    concealed: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
    hidden: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
    undetected: { "critical-success": "undetected", success: "undetected", failure: "observed", "critical-failure": "observed" },
  },
  sneak: {
    observed: { "critical-success": "undetected", success: "hidden", failure: "observed", "critical-failure": "observed" },
    concealed: { "critical-success": "undetected", success: "hidden", failure: "concealed", "critical-failure": "concealed" },
    hidden: { "critical-success": "undetected", success: "hidden", failure: "hidden", "critical-failure": "hidden" },
    undetected: { "critical-success": "undetected", success: "undetected", failure: "undetected", "critical-failure": "undetected" },
  },
  "create-a-diversion": {
    observed: { "critical-success": "hidden", success: "hidden", failure: "observed", "critical-failure": "observed" },
    concealed: { "critical-success": "hidden", success: "hidden", failure: "concealed", "critical-failure": "concealed" },
    hidden: { "critical-success": "hidden", success: "hidden", failure: "hidden", "critical-failure": "hidden" },
    undetected: { "critical-success": "undetected", success: "undetected", failure: "undetected", "critical-failure": "undetected" },
  },
  // Point Out defines its own observer/target mapping; leave empty for now
  "point-out": {},
  consequences: {},
};

export function getDefaultNewStateFor(actionType, oldState, outcomeLevel) {
  const map = DEFAULT_OUTCOME_MAPPING[actionType];
  if (!map) return null;
  const old = map[oldState];
  if (!old) return null;
  return old[outcomeLevel] || null;
}



