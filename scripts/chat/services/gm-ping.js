/**
 * Utilities to ping a token's center for GM clarity.
 */

export function pingTokenCenter(token, label = "") {
  try {
    if (!token) return;
    const point = token.center || {
      x: token.x + (token.w ?? token.width * canvas.grid.size) / 2,
      y: token.y + (token.h ?? token.height * canvas.grid.size) / 2,
    };
    if (typeof canvas.ping === "function") {
      canvas.ping(point, {
        color: game.user?.color,
        name: label || (game.user?.name || "Ping"),
      });
    } else if (canvas?.pings?.create) {
      canvas.pings.create({ ...point, user: game.user });
    }
  } catch (_) {}
}


