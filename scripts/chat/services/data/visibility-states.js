// Centralized visibility state configuration (icon, color, label)

export const VISIBILITY_STATE_CONFIG = {
  observed: {
    icon: "fas fa-eye",
    color: "#4caf50",
    label: () => game.i18n.localize("PF2E.condition.observed.name"),
  },
  concealed: {
    icon: "fas fa-cloud",
    color: "#FFC107",
    label: () => game.i18n.localize("PF2E.condition.concealed.name"),
  },
  hidden: {
    icon: "fas fa-eye-slash",
    color: "#ff6600",
    label: () => game.i18n.localize("PF2E.condition.hidden.name"),
  },
  undetected: {
    icon: "fas fa-ghost",
    color: "#f44336",
    label: () => game.i18n.localize("PF2E.condition.undetected.name"),
  },
};

export function getVisibilityStateConfig(state) {
  if (!state) return null;
  const entry = VISIBILITY_STATE_CONFIG[state];
  if (!entry) return null;
  // Resolve label at call time for i18n
  return { icon: entry.icon, color: entry.color, label: typeof entry.label === "function" ? entry.label() : entry.label };
}




