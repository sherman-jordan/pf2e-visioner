/**
 * Shared UI utility functions for common interface behaviors
 */

/**
 * Add click handlers to token and wall images in dialog tables
 * @param {HTMLElement} element - The container element to search for images
 * @param {Object} context - Context object that should have panToAndSelectToken and panToWall methods
 */
export function addTokenImageClickHandlers(element, context) {
    if (!element || !context) return;
    
    const tokenImages = element.querySelectorAll('.token-image img');
    tokenImages.forEach((img) => {
        img.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Get the token ID from the closest row
            const row = img.closest('tr[data-token-id]');
            const wallRow = img.closest('tr[data-wall-id]');
            
            if (row) {
                // Handle token images
                const tokenId = row.dataset.tokenId;
                if (!tokenId) return;
                
                // Find the token on the canvas
                const token = canvas.tokens.get(tokenId);
                if (!token) return;
                
                // Pan to the token and select it
                if (typeof context.panToAndSelectToken === 'function') {
                    context.panToAndSelectToken(token);
                }
            } else if (wallRow) {
                // Handle wall images
                const wallId = wallRow.dataset.wallId;
                if (!wallId) return;
                
                // Find the wall on the canvas
                const wall = canvas.walls.get(wallId);
                if (!wall) return;
                
                // Pan to the wall center
                if (typeof context.panToWall === 'function') {
                    context.panToWall(wall);
                }
            }
        });
    });
}

/**
 * Pan to and select a token on the canvas
 * @param {Object} token - The token to pan to and select
 */
export function panToAndSelectToken(token) {
    if (!token) return;
    
    try {
        // Pan to the token
        canvas.animatePan({ x: token.center.x, y: token.center.y }, { duration: 500 });
        
        // Select the token (deselect others first)
        canvas.tokens.releaseAll();
        token.control({ releaseOthers: true });
        
        // Optional: Add a brief highlight effect
        if (typeof token.highlight === 'function') {
            token.highlight();
            setTimeout(() => {
                if (typeof token.unhighlight === 'function') {
                    token.unhighlight();
                }
            }, 1000);
        }
    } catch (error) {
        console.warn('Error panning to token:', error);
    }
}

/**
 * Pan to a wall on the canvas
 * @param {Object} wall - The wall to pan to
 */
export function panToWall(wall) {
    if (!wall) return;
    
    try {
        // Calculate wall center - try different methods for compatibility
        let centerX, centerY;
        
        if (wall.center) {
            // Use wall.center if available
            centerX = wall.center.x;
            centerY = wall.center.y;
        } else {
            // Calculate from coordinates
            const coords = wall.coords || [];
            if (coords.length >= 4) {
                centerX = (coords[0] + coords[2]) / 2;
                centerY = (coords[1] + coords[3]) / 2;
            } else {
                console.warn('Unable to calculate wall center');
                return;
            }
        }
        
        // Pan to the wall center
        canvas.animatePan({ x: centerX, y: centerY }, { duration: 500 });
        
        // Highlight the wall briefly
        if (typeof wall.highlight === 'function') {
            wall.highlight();
            setTimeout(() => {
                if (typeof wall.unhighlight === 'function') {
                    wall.unhighlight();
                }
            }, 1000);
        }
    } catch (error) {
        console.warn('Error panning to wall:', error);
    }
}
