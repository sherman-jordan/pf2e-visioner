// Centralized mapping of desired override states per action type

export function getDesiredOverrideStatesForAction(actionType, outcome) {
  switch (actionType) {
    case "seek":
      return ["observed", "concealed", "hidden", "undetected"];
    case "hide":
      // Hide generally toggles visibility for observers who currently see you
      return ["observed", "concealed", "hidden"];
    case "sneak":
      return ["observed", "hidden", "undetected"];
    case "create-a-diversion":
      return ["observed", "hidden", "undetected"];
    case "point-out":
      // Point Out exposes a hidden target as hidden to allies (single option in UI)
      return ["hidden"];
    case "consequences":
      // Consequences toggles whether target is considered observed for damage application
      return ["observed", "concealed", "hidden", "undetected"];
    default:
      return ["observed", "concealed", "hidden", "undetected"];
  }
}



