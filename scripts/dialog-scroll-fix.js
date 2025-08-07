/**
 * Direct scroll fix for action preview dialogs
 * This script applies direct DOM manipulations to ensure scrolling works
 */

/**
 * Initialize the scroll fix
 */
export function initializeDialogScrollFix() {
  // Hook into application rendering
  Hooks.on('renderApplication', (app, html, data) => {
    // Check if this is one of our preview dialogs
    if (app.constructor.name.includes('PreviewDialog')) {
      // Wait a moment for the DOM to fully render
      setTimeout(() => {
        applyScrollFix(html[0]);
      }, 100);
    }
  });
}

/**
 * Apply scroll fix to dialog
 * @param {HTMLElement} element - The dialog element
 */
function applyScrollFix(element) {
  if (!element) return;
  
  // Get the dialog window
  const dialogWindow = element.closest('.app.window-app');
  if (!dialogWindow) return;
  
  // Determine the dialog type and set theme colors
  const dialogType = getDialogType(dialogWindow);
  const themeColors = getThemeColors(dialogType);
  
  // Force the dialog to have a fixed height
  dialogWindow.style.height = '600px';
  
  // Get the window content
  const windowContent = dialogWindow.querySelector('.window-content');
  if (!windowContent) return;
  
  // Force the window content to be full height with no overflow
  windowContent.style.height = '100%';
  windowContent.style.overflow = 'hidden';
  
  // Get the content wrapper
  const contentWrapper = windowContent.querySelector('[class$="-preview-content"]');
  if (!contentWrapper) return;
  
  // Force the content wrapper to be flex with full height
  contentWrapper.style.display = 'flex';
  contentWrapper.style.flexDirection = 'column';
  contentWrapper.style.height = '100%';
  contentWrapper.style.overflow = 'hidden';
  
  // Get the table container
  const tableContainer = contentWrapper.querySelector('.results-table-container');
  if (!tableContainer) return;
  
  // Force the table container to grow and scroll
  tableContainer.style.flex = '1 1 auto';
  tableContainer.style.overflowY = 'scroll';
  tableContainer.style.minHeight = '200px';
  
  // Apply themed scrollbar styles
  applyThemedScrollbar(tableContainer, themeColors);
  
  // Get the table headers
  const tableHeaders = tableContainer.querySelectorAll('thead th');
  tableHeaders.forEach(header => {
    // Force headers to be sticky
    header.style.position = 'sticky';
    header.style.top = '0';
    header.style.zIndex = '10';
    header.style.backgroundColor = themeColors.headerBg || '#444';
    header.style.color = themeColors.headerText || '#fff';
  });
  
  // Get the footer
  const footer = contentWrapper.querySelector('[class$="-bulk-actions-header"]');
  if (!footer) return;
  
  // Force the footer to not grow
  footer.style.flex = '0 0 auto';
}

/**
 * Determine the dialog type from the dialog window
 * @param {HTMLElement} dialogWindow - The dialog window element
 * @returns {string} The dialog type
 */
function getDialogType(dialogWindow) {
  if (dialogWindow.classList.contains('hide-preview-dialog')) return 'hide';
  if (dialogWindow.classList.contains('seek-preview-dialog')) return 'seek';
  if (dialogWindow.classList.contains('point-out-preview-dialog')) return 'point-out';
  if (dialogWindow.classList.contains('sneak-preview-dialog')) return 'sneak';
  if (dialogWindow.classList.contains('create-a-diversion-preview-dialog')) return 'create-a-diversion';
  return 'default';
}

/**
 * Get theme colors based on dialog type
 * @param {string} dialogType - The type of dialog
 * @returns {Object} Theme colors
 */
function getThemeColors(dialogType) {
  switch (dialogType) {
    case 'hide':
      return {
        primary: '#8e24aa', // Purple
        secondary: '#e1bee7',
        scrollThumb: 'rgba(142, 36, 170, 0.6)',
        scrollThumbHover: 'rgba(142, 36, 170, 0.8)',
        headerBg: '#8e24aa',
        headerText: '#ffffff'
      };
    case 'seek':
      return {
        primary: '#2c5aa0', // Blue
        secondary: '#bbdefb',
        scrollThumb: 'rgba(44, 90, 160, 0.6)',
        scrollThumbHover: 'rgba(44, 90, 160, 0.8)',
        headerBg: '#2c5aa0',
        headerText: '#ffffff'
      };
    case 'point-out':
      return {
        primary: '#ff9800', // Orange
        secondary: '#ffe0b2',
        scrollThumb: 'rgba(255, 152, 0, 0.6)',
        scrollThumbHover: 'rgba(255, 152, 0, 0.8)',
        headerBg: '#ff9800',
        headerText: '#ffffff'
      };
    case 'sneak':
      return {
        primary: '#6c757d', // Gray
        secondary: '#e9ecef',
        scrollThumb: 'rgba(108, 117, 125, 0.6)',
        scrollThumbHover: 'rgba(108, 117, 125, 0.8)',
        headerBg: '#6c757d',
        headerText: '#ffffff'
      };
    case 'create-a-diversion':
      return {
        primary: '#17a2b8', // Teal
        secondary: '#b2ebf2',
        scrollThumb: 'rgba(23, 162, 184, 0.6)',
        scrollThumbHover: 'rgba(23, 162, 184, 0.8)',
        headerBg: '#17a2b8',
        headerText: '#ffffff'
      };
    default:
      return {
        primary: '#495057',
        secondary: '#e9ecef',
        scrollThumb: 'rgba(73, 80, 87, 0.6)',
        scrollThumbHover: 'rgba(73, 80, 87, 0.8)',
        headerBg: '#444',
        headerText: '#ffffff'
      };
  }
}

/**
 * Apply themed scrollbar styles to an element
 * @param {HTMLElement} element - The element to style
 * @param {Object} themeColors - The theme colors
 */
function applyThemedScrollbar(element, themeColors) {
  // Apply Firefox scrollbar styling directly to the element
  element.style.scrollbarWidth = 'thin';
  element.style.scrollbarColor = `${themeColors.scrollThumb} transparent`;
  
  // Apply direct inline styles for WebKit scrollbar
  // This is more reliable than injecting CSS
  const styleObj = {
    '--scrollbar-thumb-color': themeColors.scrollThumb,
    '--scrollbar-thumb-hover-color': themeColors.scrollThumbHover,
    '--header-bg-color': themeColors.headerBg,
    '--header-text-color': themeColors.headerText
  };
  
  // Apply custom properties to the element
  Object.keys(styleObj).forEach(prop => {
    element.style.setProperty(prop, styleObj[prop]);
  });
  
  // Add a class to identify this element as having themed scrollbars
  element.classList.add('pf2e-visioner-themed-scrollbar');
  
  // Apply direct styles to table headers
  const headers = element.querySelectorAll('thead th');
  headers.forEach(header => {
    header.style.backgroundColor = themeColors.headerBg;
    header.style.color = themeColors.headerText;
  });
  
  // Create and inject WebKit scrollbar styles
  const styleId = 'pf2e-visioner-themed-scrollbars';
  let styleEl = document.getElementById(styleId);
  
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
    
    // Add base styles for the themed scrollbar
    styleEl.textContent = `
      .pf2e-visioner-themed-scrollbar::-webkit-scrollbar {
        width: 8px !important;
      }
      .pf2e-visioner-themed-scrollbar::-webkit-scrollbar-track {
        background: transparent !important;
      }
      .pf2e-visioner-themed-scrollbar::-webkit-scrollbar-thumb {
        background: var(--scrollbar-thumb-color, rgba(73, 80, 87, 0.6)) !important;
        border-radius: 4px !important;
      }
      .pf2e-visioner-themed-scrollbar::-webkit-scrollbar-thumb:hover {
        background: var(--scrollbar-thumb-hover-color, rgba(73, 80, 87, 0.8)) !important;
      }
    `;
  }
}