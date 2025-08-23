// Centralized visibility state configuration (icon, color, label, cssClass)
import { VISIBILITY_STATES } from '../../../constants.js';

export function getVisibilityStateConfig(state) {
  if (!state) return null;
  const entry = VISIBILITY_STATES[state];
  if (!entry) return null;
  // Resolve label at call time for i18n and include cssClass
  return {
    icon: entry.icon,
    color: entry.color,
    cssClass: entry.cssClass,
    label: game.i18n.localize(entry.label),
  };
}
