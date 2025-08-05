/**
 * Modern CSS styles for the chat automation system
 * Provides styling for automation panels and preview dialogs
 */

/**
 * Initialize and inject CSS styles for chat automation
 */
export function injectChatAutomationStyles() {
    // Re-enable CSS injection for chat automation styles
    const css = getChatAutomationCSS();
    
    // Check if styles are already injected
    if (document.getElementById('pf2e-visioner-chat-styles')) {
        return;
    }
    
    // Create and inject style element
    const style = document.createElement('style');
    style.id = 'pf2e-visioner-chat-styles';
    style.textContent = css;
    document.head.appendChild(style);
    
    console.debug('PF2E Visioner: Chat automation styles injected');
}

/**
 * Get the complete CSS for chat automation
 * @returns {string} Complete CSS string
 */
function getChatAutomationCSS() {
    return `
        /* Automation Panel Styles - Base */
        .pf2e-visioner-automation-panel {
            border-radius: 8px;
            margin: 12px 0 8px 0;
            padding: 12px;
            position: relative;
            z-index: 10;
        }
        
        /* Seek Panel - Blue Theme */
        .pf2e-visioner-automation-panel.seek-panel {
            background: linear-gradient(135deg, #e3f2fd, #bbdefb);
            border: 2px solid #2c5aa0;
            box-shadow: 0 4px 8px rgba(44, 90, 160, 0.15);
        }
        
        /* Point Out Panel - Orange Theme */
        .pf2e-visioner-automation-panel.point-out-panel {
            background: linear-gradient(135deg, #fff3e0, #ffe0b2);
            border: 2px solid #ff9800;
            box-shadow: 0 4px 8px rgba(255, 152, 0, 0.15);
        }
        
        /* Hide Panel - Purple Theme */
        .pf2e-visioner-automation-panel.hide-panel {
            background: linear-gradient(135deg, #f3e5f5, #e1bee7);
            border: 2px solid #8e24aa;
            box-shadow: 0 4px 8px rgba(142, 36, 170, 0.15);
        }
        
        /* Sneak Panel - Gray Theme */
        .pf2e-visioner-automation-panel.sneak-panel {
            background: linear-gradient(135deg, #f8f9fa, #e9ecef);
            border: 2px solid #6c757d;
            box-shadow: 0 4px 8px rgba(108, 117, 125, 0.15);
        }
        
        .automation-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-weight: 600;
            color: #495057;
        }
        
        .automation-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        
        .visioner-btn {
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 36px;
            text-decoration: none;
            user-select: none;
        }
        
        .visioner-btn-primary {
            background: linear-gradient(135deg, #007bff, #0056b3);
            color: white;
        }
        
        /* Action-Specific Button Styles */
        .visioner-btn-seek {
            background: linear-gradient(135deg, #2c5aa0, #1e3a6f);
            color: white;
        }
        
        .visioner-btn-point-out {
            background: linear-gradient(135deg, #ff9800, #f57c00);
            color: white;
        }
        
        .visioner-btn-hide {
            background: linear-gradient(135deg, #8e24aa, #6a1b9a);
            color: white;
        }
        
        .visioner-btn-sneak {
            background: linear-gradient(135deg, #6c757d, #495057);
            color: white;
        }
        
        .visioner-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        /* Unified Bulk Action Button Styles */
        .bulk-action-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
            white-space: nowrap;
        }
        
        .bulk-action-btn.apply-all {
            background: linear-gradient(135deg, #28a745, #1e7e34);
            color: white;
            border: 1px solid #1e7e34;
        }
        
        .bulk-action-btn.apply-all:hover:not(:disabled) {
            background: linear-gradient(135deg, #218838, #1c7430);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
        }
        
        .bulk-action-btn.apply-all:disabled {
            background: linear-gradient(135deg, #6c757d, #5a6268);
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        .bulk-action-btn.revert-all {
            background: linear-gradient(135deg, #6c757d, #5a6268);
            color: white;
            border: 1px solid #5a6268;
        }
        
        .bulk-action-btn.revert-all:hover:not(:disabled) {
            background: linear-gradient(135deg, #5a6268, #545b62);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(108, 117, 125, 0.3);
        }
        
        .bulk-action-btn.revert-all:disabled {
            background: linear-gradient(135deg, #6c757d, #5a6268);
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        /* Seek Preview Dialog Styles */
        .seek-preview-dialog {
            min-width: 600px;
        }
        
        .seek-preview-dialog .window-header {
            background: linear-gradient(135deg, #2c5aa0 0%, #1e3a6f 100%);
            color: white;
            border-bottom: 2px solid #1e3a6f;
        }
        
        .seek-preview-dialog .window-header .window-title {
            color: white;
            font-weight: bold;
        }
        
        .seek-preview-dialog .window-header .header-button {
            color: white;
        }
        
        .seek-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        /* Hide Preview Dialog Styles */
        .hide-preview-dialog {
            min-width: 600px;
        }
        
        .hide-preview-dialog .window-header {
            background: linear-gradient(135deg, #8e24aa 0%, #6a1b9a 100%);
            color: white;
            border-bottom: 2px solid #6a1b9a;
        }
        
        .hide-preview-dialog .window-header .window-title {
            color: white;
            font-weight: bold;
        }
        
        .hide-preview-dialog .window-header .header-button {
            color: white;
        }
        
        .hide-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .hide-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .hider-info {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            padding: 12px;
            background: var(--color-bg-option, rgba(142, 36, 170, 0.15));
            border-radius: 6px;
            border-left: 4px solid #8e24aa;
        }
        
        .hider-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid #8e24aa;
            margin-right: 12px;
        }
        
        .hider-details {
            flex: 1;
        }
        
        .hider-name {
            margin: 0 0 4px 0;
            font-size: 16px;
            font-weight: bold;
            color: #8e24aa;
        }
        
        /* Hide Dialog Table Headers - Purple Theme Override */
        .hide-results-table th {
            background: linear-gradient(135deg, #8e24aa, #6a1b9a) !important;
            color: white !important;
        }

        
        /* Hide Dialog Visibility Change Column */
        .hide-results-table .visibility-change {
            text-align: center;
            width: 115px;
            min-width: 115px;
            padding: 8px 12px;
        }
        
        /* Hide Dialog Actions Column */
        .hide-results-table .actions {
            text-align: center;
            width: 100px;
            padding: 12px;
        }
        
        .hide-results-table .row-actions {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 6px;
        }

        
        /* Hide Dialog specific styling now uses unified styles above */
        
        /* Hide Dialog Bulk Action Buttons */
        .hide-preview-dialog-bulk-action-btn {
            padding: 6px 12px !important;
            font-size: 12px !important;
            border-radius: 4px !important;
            font-weight: 500 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
        }
        
        .hide-preview-dialog-bulk-action-btn.apply-all {
            background: linear-gradient(135deg, #28a745, #1e7e34) !important;
            color: white !important;
            border: 1px solid #1e7e34 !important;
        }
        
        .hide-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: linear-gradient(135deg, #218838, #1c7430) !important;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3) !important;
        }
        
        .hide-preview-dialog-bulk-action-btn.revert-all {
            background: linear-gradient(135deg, #6c757d, #5a6268) !important;
            color: white !important;
            border: 1px solid #5a6268 !important;
        }
        
        .hide-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: linear-gradient(135deg, #5a6268, #545b62) !important;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(108, 117, 125, 0.3) !important;
        }
        
        .hide-preview-dialog-bulk-action-btn.revert-all:disabled {
            background: linear-gradient(135deg, #6c757d, #5a6268) !important;
            opacity: 0.6 !important;
            cursor: not-allowed !important;
            transform: none !important;
            box-shadow: none !important;
        }
        
        .seek-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .seeker-info {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            padding: 12px;
            background: var(--color-bg-option, rgba(44, 90, 160, 0.15));
            border-radius: 6px;
            border-left: 4px solid #2c5aa0;
        }
        
        .seeker-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid #2c5aa0;
            margin-right: 12px;
        }
        
        .seeker-name {
            margin: 0 0 4px 0;
            color: var(--color-text-primary, #f0f0f0);
            font-size: 16px;
            font-weight: bold;
        }
        
        .hint {
            margin: 0;
            color: var(--color-text-secondary, #b0b0b0);
            font-style: italic;
            font-size: 12px;
        }
        
        /* ===== UNIFIED TABLE STYLES ===== */
        
        /* Base Results Table Container */
        .results-table-container {
            margin-bottom: 16px;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 6px;
            overflow: hidden;
            background: var(--color-bg-primary, #2a2a2a);
        }
        
        /* Unified Results Table Base Styles */
        .results-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            table-layout: fixed;
        }
        
        /* Unified Table Headers */
        .results-table thead {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .results-table th {
            padding: 8px 6px;
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            color: var(--color-text-primary, #f0f0f0);
            border-bottom: 2px solid var(--color-border-light-primary, #555);
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        /* Unified Table Cells */
        .results-table td {
            padding: 8px 6px;
            text-align: center;
            border-bottom: 1px solid var(--color-border-light-tertiary, #444);
            vertical-align: middle;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .results-table tbody tr:nth-child(even) td {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
        }
        
        /* Apply unified styles to all dialog tables */
        .seek-results-table,
        .hide-results-table,
        .point-out-results-table,
        .sneak-results-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            table-layout: fixed;
        }
        
        .seek-results-table thead,
        .hide-results-table thead,
        .point-out-results-table thead,
        .sneak-results-table thead {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .seek-results-table th,
        .hide-results-table th,
        .point-out-results-table th,
        .sneak-results-table th {
            padding: 8px 6px;
            text-align: center;
            font-weight: bold;
            font-size: 12px !important;
            color: var(--color-text-primary, #f0f0f0);
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .seek-results-table td,
        .hide-results-table td,
        .point-out-results-table td,
        .sneak-results-table td {
            padding: 8px 6px;
            text-align: center;
            border-bottom: 1px solid var(--color-border-light-tertiary, #444);
            vertical-align: middle;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .seek-results-table tbody tr:nth-child(even) td,
        .hide-results-table tbody tr:nth-child(even) td,
        .point-out-results-table tbody tr:nth-child(even) td,
        .sneak-results-table tbody tr:nth-child(even) td {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
        }
        
        /* ===== UNIFIED TOKEN IMAGE STYLING ===== */
        
        /* Token Image Column Styling - Unified */
        .results-table .token-image,
        .seek-results-table .token-image,
        .hide-results-table .token-image,
        .point-out-results-table .token-image,
        .sneak-results-table .token-image {
            width: 50px;
            min-width: 50px;
            text-align: center;
            padding: 8px 4px;
        }
        
        /* Token Image Styling - Unified */
        .results-table .token-image img,
        .seek-results-table .token-image img,
        .hide-results-table .token-image img,
        .point-out-results-table .token-image img,
        .sneak-results-table .token-image img,
        .visibility-table .token-image img,
        .visibility-table.sneak-results-table .token-image img {
            width: 32px !important;
            height: 32px !important;
            border-radius: 4px;
            border: 1px solid var(--color-border-light-primary, #555);
            object-fit: cover;
            object-position: center;
            display: block;
            margin: 0 auto;
        }
        
        /* Force Sneak Dialog Token Image Border - High Priority */
        .sneak-preview-dialog .visibility-table .token-image img,
        .sneak-preview-dialog .sneak-results-table .token-image img,
        .sneak-preview-dialog .visibility-table.sneak-results-table .token-image img {
            border: 1px solid #555 !important;
            border-radius: 4px !important;
            width: 32px !important;
            height: 32px !important;
            box-sizing: border-box !important;
        }
        
        /* Alternative selector in case dialog class is different */
        .sneak-results-preview .visibility-table .token-image img,
        .sneak-results-preview .sneak-results-table .token-image img {
            border: 1px solid #555 !important;
            border-radius: 4px !important;
            width: 32px !important;
            height: 32px !important;
            box-sizing: border-box !important;
        }
        
        /* ===== UNIFIED ROLL VS DC STYLING ===== */
        
        /* DC Number Styling - Unified */
        .results-table .dc-value,
        .seek-results-table .dc-value,
        .hide-results-table .dc-value,
        .point-out-results-table .dc-value,
        .sneak-results-table .dc-value {
            color: #f44336 !important;
            font-weight: bold !important;
            font-size: 16px;
            line-height: 1.2;
        }
        
        /* Roll vs DC Column Styling - Unified */
        .results-table .roll-vs-dc,
        .seek-results-table .roll-vs-dc,
        .hide-results-table .roll-vs-dc,
        .point-out-results-table .roll-vs-dc,
        .sneak-results-table .roll-vs-dc {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            line-height: 1.2;
        }
        
        .results-table .roll-result,
        .seek-results-table .roll-result,
        .hide-results-table .roll-result,
        .point-out-results-table .roll-result,
        .sneak-results-table .roll-result {
            text-align: center;
        }
        
        .results-table .roll-dc-line,
        .seek-results-table .roll-dc-line,
        .hide-results-table .roll-dc-line,
        .point-out-results-table .roll-dc-line,
        .sneak-results-table .roll-dc-line {
            margin: 0;
            padding: 0;
            line-height: 1.2;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 4px;
        }
        
        .results-table .vs-text,
        .seek-results-table .vs-text,
        .hide-results-table .vs-text,
        .point-out-results-table .vs-text,
        .sneak-results-table .vs-text {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 12px;
            line-height: 1.2;
        }
        
        .results-table .margin-display,
        .seek-results-table .margin-display,
        .hide-results-table .margin-display,
        .point-out-results-table .margin-display,
        .sneak-results-table .margin-display {
            font-size: 12px;
            color: #aaa;
            text-align: center;
            margin-top: 2px;
            display: block;
            line-height: 1.2;
        }
        
        /* Roll Total Styling - Blue - Unified */
        .results-table .roll-total,
        .seek-results-table .roll-total,
        .hide-results-table .roll-total,
        .point-out-results-table .roll-total,
        .sneak-results-table .roll-total {
            color: #29b6f6 !important;
            font-weight: bold !important;
            font-size: 16px;
            line-height: 1.2;
        }
        
        /* ===== UNIFIED OUTCOME STYLING ===== */
        
        /* Outcome Base Styling - Unified */
        .results-table .outcome,
        .seek-results-table .outcome,
        .hide-results-table .outcome,
        .point-out-results-table .outcome,
        .sneak-results-table .outcome {
            text-align: center;
            font-weight: bold;
        }
        
        .results-table thead .outcome,
        .seek-results-table thead .outcome,
        .hide-results-table thead .outcome,
        .point-out-results-table thead .outcome,
        .sneak-results-table thead .outcome {
            color: inherit; /* Use default header text color */
        }
        
        /* Critical Success - Green - Unified */
        .results-table tbody td.outcome.critical-success,
        .seek-results-table tbody td.outcome.critical-success,
        .hide-results-table tbody td.outcome.critical-success,
        .point-out-results-table tbody td.outcome.critical-success,
        .sneak-results-table tbody td.outcome.critical-success {
            color: #00b050; /* Green */
        }
        
        /* Success - Blue - Unified */
        .results-table tbody td.outcome.success,
        .seek-results-table tbody td.outcome.success,
        .hide-results-table tbody td.outcome.success,
        .point-out-results-table tbody td.outcome.success,
        .sneak-results-table tbody td.outcome.success {
            color: #4a9eff; /* Blue */
        }
        
        /* Failure - Yellow/Orange - Unified */
        .results-table tbody td.outcome.failure,
        .seek-results-table tbody td.outcome.failure,
        .hide-results-table tbody td.outcome.failure,
        .point-out-results-table tbody td.outcome.failure,
        .sneak-results-table tbody td.outcome.failure {
            color: #ffc107; /* Yellow/orange */
        }
        
        /* Critical Failure - Red - Unified */
        .results-table tbody td.outcome.critical-failure,
        .seek-results-table tbody td.outcome.critical-failure,
        .hide-results-table tbody td.outcome.critical-failure,
        .point-out-results-table tbody td.outcome.critical-failure,
        .sneak-results-table tbody td.outcome.critical-failure {
            color: #f44336; /* Red */
        }
        
        /* Bulk Action Buttons */
        .seek-preview-dialog-bulk-action-btn {
            padding: 6px 12px;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 4px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .seek-preview-dialog-bulk-action-btn:hover {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            transform: translateY(-1px);
        }
        
        .seek-preview-dialog-bulk-action-btn:disabled {
            opacity: 0.8;
            cursor: not-allowed;
            background: #cccccc !important;
            border-color: #cccccc !important;
            color: #666666 !important;
            transform: none !important;
        }
        
        /* Row Action Buttons */
        .row-action-btn {
            padding: 3px 6px;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 3px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            cursor: pointer;
            font-size: 10px;
            margin: 0 2px;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 20px;
        }
        
        .row-action-btn:hover {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            transform: translateY(-1px);
        }
        
        .row-action-btn:disabled {
            opacity: 0.8;
            cursor: not-allowed;
            background: #cccccc !important;
            border-color: #cccccc !important;
            color: #666666 !important;
            transform: none !important;
        }
        
        /* Specific colors for apply and revert row buttons */
        .row-action-btn.apply-change {
            background: #4caf50;
            border-color: #4caf50;
            color: white;
        }
        
        .row-action-btn.apply-change:hover:not(:disabled) {
            background: #45a049;
            border-color: #45a049;
        }
        
        .row-action-btn.revert-change {
            background: #ff9800;
            border-color: #ff9800;
            color: white;
        }
        
        .row-action-btn.revert-change:hover:not(:disabled) {
            background: #e68900;
            border-color: #e68900;
        }
        
        /* ===== UNIFIED STATE ICON SELECTION ===== */
        
        /* Override Icons Container - Unified */
        .override-icons,
        .seek-preview-dialog .override-icons,
        .hide-preview-dialog .override-icons,
        .point-out-preview-dialog .override-icons,
        .sneak-preview-dialog .override-icons {
            display: flex;
            gap: 2px;
            align-items: center;
            justify-content: center;
            flex-wrap: nowrap;
        }
        
        /* ===== OLD VISIBILITY STATUS ICONS (Plain Icons - No Button Styling) ===== */
        
        /* Old Visibility State Icons - Plain Style */
        .visibility-change-inline > .state-icon:first-child,
        .visibility-change > .state-icon:first-child,
        .hide-preview-dialog .visibility-change-inline > .state-icon:first-child,
        .point-out-preview-dialog .visibility-change > .state-icon:first-child,
        .sneak-preview-dialog .visibility-change > .state-icon:first-child {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            cursor: default !important;
            transition: none !important;
            font-size: 14px !important;
            min-width: auto !important;
            width: auto !important;
            height: auto !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            opacity: 1 !important;
            position: relative !important;
            box-sizing: content-box !important;
            box-shadow: none !important;
            transform: none !important;
        }
        
        /* Old Visibility State Icons - No Hover Effects */
        .visibility-change-inline > .state-icon:first-child:hover,
        .visibility-change > .state-icon:first-child:hover,
        .hide-preview-dialog .visibility-change-inline > .state-icon:first-child:hover,
        .point-out-preview-dialog .visibility-change > .state-icon:first-child:hover,
        .sneak-preview-dialog .visibility-change > .state-icon:first-child:hover {
            background: transparent !important;
            border: none !important;
            opacity: 1 !important;
            transform: none !important;
            box-shadow: none !important;
        }
        
        /* Old Visibility State Icons - Inner Elements */
        .visibility-change-inline > .state-icon:first-child i,
        .visibility-change > .state-icon:first-child i,
        .hide-preview-dialog .visibility-change-inline > .state-icon:first-child i,
        .point-out-preview-dialog .visibility-change > .state-icon:first-child i,
        .sneak-preview-dialog .visibility-change > .state-icon:first-child i {
            font-size: 14px !important;
            pointer-events: none !important;
        }
        
        /* State Icon Base Styles - Unified (Excludes Old Visibility Icons) */
        .state-icon,
        .seek-preview-dialog .state-icon,
        .hide-preview-dialog .state-icon,
        .point-out-preview-dialog .state-icon,
        .sneak-preview-dialog .state-icon,
        .visibility-table .state-icon,
        .point-out-results-table .state-icon,
        .sneak-results-table .state-icon,
        .override-icons .state-icon {
            /* Note: Excludes .visibility-change .state-icon:first-child for plain old visibility styling */
            background: transparent !important;
            border: 1px solid var(--color-border-light-primary, #555) !important;
            border-radius: 4px !important;
            padding: 4px !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            font-size: 12px !important;
            min-width: 24px !important;
            width: 24px !important;
            height: 24px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            opacity: 0.6 !important;
            position: relative !important;
            box-sizing: border-box !important;
        }
        
        /* State Icon Hover - Unified (Excludes Old Visibility Icons) */
        .state-icon:hover,
        .seek-preview-dialog .state-icon:hover,
        .hide-preview-dialog .state-icon:hover,
        .point-out-preview-dialog .state-icon:hover,
        .sneak-preview-dialog .state-icon:hover,
        .visibility-table .state-icon:hover,
        .point-out-results-table .state-icon:hover,
        .sneak-results-table .state-icon:hover,
        .override-icons .state-icon:hover {
            opacity: 1 !important;
            background: rgba(255, 255, 255, 0.1) !important;
            border-color: currentColor !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
        }
        
        /* State Icon Selected - Unified (Excludes Old Visibility Icons) */
        .state-icon.selected,
        .seek-preview-dialog .state-icon.selected,
        .hide-preview-dialog .state-icon.selected,
        .point-out-preview-dialog .state-icon.selected,
        .sneak-preview-dialog .state-icon.selected,
        .visibility-table .state-icon.selected,
        .point-out-results-table .state-icon.selected,
        .sneak-results-table .state-icon.selected,
        .override-icons .state-icon.selected {
            opacity: 1 !important;
            background: rgba(255, 255, 255, 0.2) !important;
            border-color: currentColor !important;
            border-width: 2px !important;
            box-shadow: 0 0 12px rgba(255, 255, 255, 0.4) !important;
            transform: scale(1.1) !important;
        }
        
        /* Enhanced Point Out Dialog Selected State Glow */
        .point-out-preview-dialog .override-icons .state-icon.selected,
        .point-out-preview-dialog .visibility-change .state-icon.selected {
            box-shadow: 0 0 12px rgba(255, 255, 255, 0.5) !important;
            background: rgba(255, 255, 255, 0.25) !important;
            border-width: 2px !important;
            transform: scale(1.15) !important;
        }
        
        /* State Icon Calculated Outcome - Unified (Excludes Old Visibility Icons) */
        .state-icon.calculated-outcome,
        .seek-preview-dialog .state-icon.calculated-outcome,
        .hide-preview-dialog .state-icon.calculated-outcome,
        .point-out-preview-dialog .state-icon.calculated-outcome,
        .sneak-preview-dialog .state-icon.calculated-outcome,
        .visibility-table .state-icon.calculated-outcome,
        .point-out-results-table .state-icon.calculated-outcome,
        .sneak-results-table .state-icon.calculated-outcome,
        .override-icons .state-icon.calculated-outcome {
            background: rgba(255, 255, 255, 0.1) !important;
            border-color: currentColor !important;
            border-width: 2px !important;
            animation: pulse-glow 2s infinite !important;
        }
        
        /* State Icon Inner Elements - Unified (Excludes Old Visibility Icons) */
        .state-icon i,
        .seek-preview-dialog .state-icon i,
        .hide-preview-dialog .state-icon i,
        .point-out-preview-dialog .state-icon i,
        .sneak-preview-dialog .state-icon i,
        .visibility-table .state-icon i,
        .point-out-results-table .state-icon i,
        .sneak-results-table .state-icon i,
        .override-icons .state-icon i {
            font-size: 12px !important;
            pointer-events: none !important;
        }
        
        /* Point Out Preview Dialog Styles */
        .point-out-preview-dialog {
            min-width: 350px;
            max-width: 450px;
            width: auto;
        }
        
        .point-out-preview-dialog .window-header {
            background: linear-gradient(135deg, #ff9800 0%, #e65100 100%);
            color: white;
        }
        
        .point-out-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            max-height: 80vh;
            overflow-y: auto;
        }
        
        .point-out-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .actor-info {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 152, 0, 0.15));
            border-radius: 6px;
            border-left: 4px solid #ff9800;
        }
        
        .actor-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid #ff9800;
            margin-right: 12px;
        }
        
        .actor-name {
            margin: 0 0 4px 0;
            color: var(--color-text-primary, #f0f0f0);
            font-size: 16px;
            font-weight: bold;
        }
        
        /* Point Out Dialog Table - Orange Theme Override */
        .point-out-results-table {
            margin: 0px;
        }
        
        .point-out-results-table th {
            background: linear-gradient(135deg, #ff9800, #e65100) !important;
            color: white !important;
        }
        
        /* Point Out Dialog Bulk Actions Header */
        .point-out-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            background: rgba(255, 152, 0, 0.1);
            border-radius: 6px;
            border-top: 1px solid #ff9800;
            gap: 20px;
        }
        
        .point-out-preview-dialog-bulk-actions-info {
            font-size: 12px;
            font-weight: 600;
            color: var(--color-text-primary, #f0f0f0);
            flex: 1;
        }
        
        /* ===== UNIFIED BULK ACTIONS TEXT STYLING WITH THEME COLORS ===== */
        
        /* Base Styling for All Changes Count and Total Count */
        .point-out-preview-dialog-changes-count,
        .point-out-preview-dialog-total-count,
        .sneak-preview-dialog .sneak-preview-dialog-changes-count,
        .sneak-preview-dialog .sneak-preview-dialog-total-count,
        .seek-preview-dialog-changes-count,
        .seek-preview-dialog-total-count,
        .hide-preview-dialog-changes-count,
        .hide-preview-dialog-total-count {
            font-weight: 700 !important;
        }
        
        /* Point Out Dialog - Orange Theme */
        .point-out-preview-dialog-changes-count,
        .point-out-preview-dialog-total-count {
            color: #ff9800 !important;
        }
        
        /* Sneak Dialog - Gray Theme */
        .sneak-preview-dialog .sneak-preview-dialog-changes-count,
        .sneak-preview-dialog .sneak-preview-dialog-total-count {
            color:rgb(123, 126, 129) !important;
        }
        
        /* Seek Dialog - Blue Theme */
        .seek-preview-dialog-changes-count,
        .seek-preview-dialog-total-count {
            color:rgb(78, 127, 199) !important;
        }
        
        /* Hide Dialog - Purple Theme */
        .hide-preview-dialog-changes-count,
        .hide-preview-dialog-total-count {
            color:rgb(175, 52, 209) !important;
        }
        
        .point-out-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 12px;
            flex-wrap: nowrap;
            align-items: center;
            margin-left: 20px;
        }
        
        /* Seek Dialog Table Headers - Blue Theme Override */
        .seek-results-table th {
            background: linear-gradient(135deg, #2c5aa0, #1e3a6f) !important;
            color: white !important;
        }
        
        /* Sneak Dialog Table Headers - Gray Theme Override */
        .sneak-results-table th {
            background: linear-gradient(135deg, #6c757d, #495057) !important;
            color: white !important;
        }
        
        /* Point Out Dialog Visibility Change Layout */
        .point-out-preview-dialog .visibility-change {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-height: 32px;
        }
        
        .point-out-preview-dialog .visibility-arrow {
            color: var(--color-text-secondary, #b0b0b0);
            font-size: 12px;
            margin: 0 4px;
        }
        
        /* Point Out state icon styles removed - now using unified styles */
        
        .point-out-preview-dialog .no-change-indicator {
            color: var(--color-text-secondary, #b0b0b0);
            font-style: italic;
            font-size: 11px;
        }
        
        .point-out-preview-dialog-bulk-action-btn {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 6px;
            padding: 10px 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin: 0 6px;
            min-width: 120px;
            justify-content: center;
        }
        
        .point-out-preview-dialog-bulk-action-btn:hover:not(:disabled) {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            transform: translateY(-1px);
        }
        
        .point-out-preview-dialog-bulk-action-btn:disabled {
            opacity: 0.8;
            cursor: not-allowed;
            background: #cccccc !important;
            border-color: #cccccc !important;
            color: #666666 !important;
            transform: none !important;
        }
        
        .point-out-preview-dialog-bulk-action-btn.apply-all {
            background: #4caf50;
            border-color: #4caf50;
            color: white;
        }
        
        .point-out-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: #45a049;
            border-color: #45a049;
        }
        
        .point-out-preview-dialog-bulk-action-btn.revert-all {
            background: #ff9800;
            border-color: #ff9800;
            color: white;
        }
        
        .point-out-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: #e68900;
            border-color: #e68900;
        }
        
        /* Point Out Dialog Bulk Actions Header */
        .point-out-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-top: 1px solid var(--color-border-light-primary, #555);
            margin-top: 12px;
        }
        
        .point-out-preview-dialog-bulk-actions-info {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 13px;
            font-weight: 500;
        }
        
        .point-out-preview-dialog-changes-count {
            font-weight: bold;
            color: var(--color-text-highlight, #ffffff);
        }
        
        .point-out-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 8px;
        }
        
        /* Action Type Specific Styles */
        .pf2e-visioner-automation-panel[data-action-type="point-out"] {
            border-color: #ff9800;
        }
        
        .pf2e-visioner-automation-panel[data-action-type="point-out"] .visioner-btn-primary {
            background: linear-gradient(135deg, #ff9800, #e65100);
            border-color: #ff9800;
            color: white;
        }
        
        .pf2e-visioner-automation-panel[data-action-type="point-out"] .visioner-btn-primary:hover {
            background: linear-gradient(135deg, #f57c00, #d84315);
            border-color: #f57c00;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(255, 152, 0, 0.3);
        }
        
        /* State Icon Selection */
        .icon-selection {
            display: flex;
            gap: 2px;
            align-items: center;
            justify-content: center;
            flex-wrap: nowrap;
        }
        
        .state-icon {
            background: transparent;
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 4px;
            padding: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            position: relative;
        }
        
        .state-icon:hover {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            border-color: var(--color-border-highlight, #777);
            transform: scale(1.05);
        }
        
        .state-icon.selected {
            background: var(--color-bg-btn, rgba(255, 255, 255, 0.2));
            border-color: currentColor;
            border-width: 2px;
            box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
            transform: scale(1.1);
        }
        
        .state-icon.calculated-outcome {
            background: rgba(255, 255, 255, 0.1);
            border-color: currentColor;
            border-width: 2px;
            animation: pulse-glow 2s infinite;
        }
        
        @keyframes pulse-glow {
            0%, 100% { 
                box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
                transform: scale(1.0);
            }
            50% { 
                box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
                transform: scale(1.05);
            }
        }
        
        .state-icon i {
            font-size: 12px;
            pointer-events: none;
        }
        
        .override-icons {
            display: flex;
            gap: 2px;
            align-items: center;
            justify-content: center;
        }
        
        .visibility-change-with-override {
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: center;
        }
        
        .visibility-change-with-override > i {
            font-size: 14px;
        }
        
        /* Row Action Buttons */
        .row-action-btn {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 4px;
            padding: 4px 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            margin: 0 2px;
            font-size: 10px;
        }
        
        .row-action-btn:hover:not(:disabled) {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            border-color: var(--color-border-highlight, #777);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .row-action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: var(--color-bg-disabled, #444);
            border-color: var(--color-border-disabled, #666);
            color: var(--color-text-disabled, #888);
            transform: none;
        }
        
        .row-action-btn.applied {
            background: #4caf50;
            border-color: #4caf50;
            color: white;
        }
        
        .row-action-btn.reverted {
            background: #ff9800;
            border-color: #ff9800;
            color: white;
        }
        
        /* Bulk Action Buttons */
        .seek-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-top: 1px solid var(--color-border-light-primary, #555);
            margin-top: 12px;
        }
        
        .seek-preview-dialog-bulk-actions-info {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 13px;
            font-weight: 500;
        }
        
        .seek-preview-dialog-changes-count {
            font-weight: bold;
            color: var(--color-text-highlight, #ffffff);
        }
        
        .seek-preview-dialog-total-count {
            font-weight: bold;
        }
        
        .seek-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 8px;
        }
        
        .seek-preview-dialog-bulk-action-btn {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-width: 100px;
            justify-content: center;
        }
        
        .seek-preview-dialog-bulk-action-btn:hover:not(:disabled) {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            border-color: var(--color-border-highlight, #777);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .seek-preview-dialog-bulk-action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: var(--color-bg-disabled, #444);
            border-color: var(--color-border-disabled, #666);
            color: var(--color-text-disabled, #888);
            transform: none;
        }
        
        .seek-preview-dialog-bulk-action-btn.apply-all {
            background: #4caf50;
            border-color: #4caf50;
            color: white;
        }
        
        .seek-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: #45a049;
            border-color: #45a049;
        }
        
        .seek-preview-dialog-bulk-action-btn.revert-all {
            background: #ff9800;
            border-color: #ff9800;
            color: white;
        }
        
        .seek-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: #e68900;
            border-color: #e68900;
        }
        
        /* Encounter Filter Section */
        .encounter-filter-section {
            margin-bottom: 12px;
            padding: 8px 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-radius: 6px;
            border: 1px solid var(--color-border-light-primary, #555);
        }
        
        .encounter-filter-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
        }
        
        .encounter-filter-checkbox input[type="checkbox"] {
            margin: 0;
            cursor: pointer;
        }
        
        .encounter-filter-label {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
        }
        
        .encounter-filter-checkbox:hover .encounter-filter-label {
            color: var(--color-text-highlight, #ffffff);
        }
        
        /* ===== SNEAK PREVIEW DIALOG STYLES ===== */
        
        /* Sneak Preview Dialog - Gray Theme */
        .sneak-preview-dialog {
            min-width: 600px;
        }
        
        .sneak-preview-dialog .window-header {
            background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
            color: white;
            border-bottom: 2px solid #495057;
        }
        
        .sneak-preview-dialog .window-header .window-title {
            color: white;
            font-weight: bold;
        }
        
        .sneak-preview-dialog .window-header .header-button {
            color: white;
        }
        
        .sneak-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .sneak-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .sneaker-info {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            padding: 12px;
            background: rgb(53, 55, 59);
            border-radius: 6px;
            border-left: 4px solid #6c757d;
        }
        
        .sneaker-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid #6c757d;
            margin-right: 12px;
        }
        
        .sneaker-details {
            flex: 1;
        }
        
        .sneaker-name {
            margin: 0 0 4px 0;
            font-size: 16px;
            font-weight: bold;
            color: #6c757d;
        }
        
        /* Sneak Dialog Bulk Action Buttons */
        .sneak-preview-dialog-bulk-action-btn {
            padding: 6px 12px !important;
            font-size: 12px !important;
            border-radius: 4px !important;
            font-weight: 500 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
        }
        
        .sneak-preview-dialog-bulk-action-btn.apply-all {
            background: linear-gradient(135deg, #28a745, #1e7e34) !important;
            color: white !important;
            border: 1px solid #1e7e34 !important;
        }
        
        .sneak-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: linear-gradient(135deg, #218838, #1c7430) !important;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3) !important;
        }
        
        .sneak-preview-dialog-bulk-action-btn.revert-all {
            background: linear-gradient(135deg, #6c757d, #5a6268) !important;
            color: white !important;
            border: 1px solid #5a6268 !important;
        }
        
        .sneak-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: linear-gradient(135deg, #5a6268, #545b62) !important;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(108, 117, 125, 0.3) !important;
        }
        
        .sneak-preview-dialog-bulk-action-btn.revert-all:disabled {
            background: linear-gradient(135deg, #6c757d, #5a6268) !important;
            opacity: 0.6 !important;
            cursor: not-allowed !important;
            transform: none !important;
            box-shadow: none !important;
        }
        
        /* Hide Preview Dialog Styles - Purple Theme */
        .hide-preview-dialog {
            min-width: 600px;
        }
        
        .hide-preview-dialog .window-header {
            background: linear-gradient(135deg, #8e24aa 0%, #6a1b9a 100%);
            color: white;
            border-bottom: 2px solid #6a1b9a;
        }
        
        .hide-preview-dialog .window-header .window-title {
            color: white;
            font-weight: bold;
        }
        
        .hide-preview-dialog .window-header .header-button {
            color: white;
        }
        
        .hide-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .hide-preview-content {
            padding: 12px;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        .hider-info {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            padding: 12px;
            background: var(--color-bg-option, rgba(142, 36, 170, 0.15));
            border-radius: 6px;
            border-left: 4px solid #8e24aa;
        }
        
        .hider-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid #8e24aa;
            margin-right: 12px;
        }
        
        .hiding-name {
            margin: 0 0 4px 0;
            color: var(--color-text-primary, #f0f0f0);
            font-size: 16px;
            font-weight: bold;
        }
        
        .hide-results-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--color-bg-primary, #2a2a2a);
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid var(--color-border-light-primary, #555);
        }
        
        .hide-results-table th {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            padding: 8px 6px;
            width: 80px;
            min-width: 80px;
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            border-bottom: 1px solid var(--color-border-light-primary, #555);
        }
        
        .hide-results-table td {
            padding: 6px;
            border-bottom: 1px solid var(--color-border-light-tertiary, #444);
            vertical-align: middle;
            text-align: center;
        }
        
        .hide-results-table tr:hover {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
        }
        
        /* Hide Dialog Visibility Change Inline Layout */
        .visibility-change-inline {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }
        
        .visibility-change-inline .visibility-arrow {
            color: #9e9e9e;
            margin: 0 4px;
        }
        
        .visibility-change-inline .no-change-indicator {
            color: #9e9e9e;
            font-style: italic;
            font-size: 0.9em;
        }
        
        .visibility-change-inline .override-icons {
            display: flex;
            gap: 6px;
        }
        
        .visibility-change-inline .state-icon {
            cursor: pointer;
            opacity: 0.7;
            transition: all 0.2s ease;
        }
        
        .visibility-change-inline .state-icon:hover {
            opacity: 1;
            transform: scale(1.1);
        }
        
        .visibility-change-inline .state-icon.selected {
            opacity: 1;
            transform: scale(1.1);
            text-shadow: 0 0 8px currentColor;
        }
        
        /* Hide Dialog Bulk Action Buttons */
        .hide-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: var(--color-bg-option, rgba(255, 255, 255, 0.05));
            border-top: 1px solid var(--color-border-light-primary, #555);
            margin-top: 12px;
        }
        
        .hide-preview-dialog-bulk-actions-info {
            color: var(--color-text-primary, #f0f0f0);
            font-size: 13px;
            font-weight: 500;
        }
        
        .hide-preview-dialog-changes-count {
            font-weight: bold;
            color: var(--color-text-highlight, #ffffff);
        }
        
        .hide-preview-dialog-total-count {
            font-weight: bold;
        }
        
        .hide-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 8px;
        }
        
        .hide-preview-dialog-bulk-action-btn {
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid var(--color-border-light-primary, #555);
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-width: 100px;
            justify-content: center;
        }
        
        .hide-preview-dialog-bulk-action-btn:hover:not(:disabled) {
            background: var(--color-bg-btn-hover, rgba(255, 255, 255, 0.2));
            border-color: var(--color-border-highlight, #777);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .hide-preview-dialog-bulk-action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: var(--color-bg-disabled, #444);
            border-color: var(--color-border-disabled, #666);
            color: var(--color-text-disabled, #888);
            transform: none;
        }
        
        .hide-preview-dialog-bulk-action-btn.apply-all {
            background: #8e24aa;
            border-color: #8e24aa;
            color: white;
        }
        
        .hide-preview-dialog-bulk-action-btn.apply-all:hover:not(:disabled) {
            background: #7b1fa2;
            border-color: #7b1fa2;
        }
        
        .hide-preview-dialog-bulk-action-btn.revert-all {
            background: #ff9800;
            border-color: #ff9800;
            color: white;
        }
        
        .hide-preview-dialog-bulk-action-btn.revert-all:hover:not(:disabled) {
            background: #e68900;
            border-color: #e68900;
        }
        
        /* Sneak Preview Dialog Styles - Gray Theme */
        .sneak-preview-dialog {
            min-width: 600px;
        }
        
        .sneak-preview-dialog .window-header {
            background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
            color: white;
            border-bottom: 2px solid #495057;
        }
        
        .sneak-preview-dialog .window-header .window-title {
            color: white;
            font-weight: bold;
        }
        
        .sneak-preview-dialog .window-header .header-button {
            color: white;
        }
        
        .sneak-preview-dialog .window-content {
            padding: 0;
            background: var(--color-bg-primary, #2a2a2a);
            color: var(--color-text-primary, #f0f0f0);
        }
        
        /* Sneak Dialog Content Structure - Match Seek Design */
        .sneak-preview-dialog .sneak-preview-content {
            padding: 16px;
        }
        
        .sneak-preview-dialog .seeker-info {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: linear-gradient(135deg, #6c757d, #495057);
            border-radius: 8px;
            margin-bottom: 16px;
        }
        
        .sneak-preview-dialog .seeker-image img {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 2px solid white;
        }
        
        .sneak-preview-dialog .sneaker-details h3 {
            margin: 0 0 4px 0;
            color: white;
            font-size: 14px;
            font-weight: bold;
        }
        
        .sneak-preview-dialog .sneaker-details .hint {
            margin: 0;
            color: rgba(255, 255, 255, 0.8);
            font-size: 11px;
            font-style: italic;
        }
        
        .sneak-preview-dialog .encounter-filter-section {
            padding: 12px 16px;
            background: rgba(108, 117, 125, 0.1);
            border-radius: 6px;
            margin-bottom: 16px;
        }
        
        .sneak-preview-dialog .encounter-filter-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            color: var(--color-text-primary, #f0f0f0);
            cursor: pointer;
        }
        
        .sneak-preview-dialog .results-table-container {
            margin-bottom: 16px;
        }
        
        .sneak-preview-dialog .visibility-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--color-bg-primary, #2a2a2a);
        }
        
        
        .sneak-preview-dialog th {
            padding: 6px 4px;
            text-align: center;
            width: 80px;
            font-weight: bold;
            font-size: 11px;
            color: var(--color-text-primary, #f0f0f0);
            border-bottom: 2px solid var(--color-border-light-primary, #555);
            background: var(--color-bg-option, rgba(255, 255, 255, 0.1));
        }
        
        .sneak-preview-dialog .visibility-table td {
            padding: 8px 6px;
            border-bottom: 1px solid #495057;
            vertical-align: middle;
            font-size: 12px;
        }
        
        /* Optimize column widths */
        .sneak-preview-dialog .visibility-table .token-image {
            width: 50px;
            text-align: center;
        }
        
        .sneak-preview-dialog .visibility-table .token-image img {
            border: none;
            border-radius: 3px;
        }
        
        .sneak-preview-dialog .visibility-table .token-name {
            width: 50px;
            text-align: center;
        }
        
        .sneak-preview-dialog .visibility-table .roll-result {
            width: 100px;
            text-align: center;
        }
        
        .sneak-preview-dialog .visibility-table .outcome {
            width: 80px;
            text-align: center;
        }
        
        .sneak-preview-dialog .visibility-table .visibility-change {
            width: 130px;
            text-align: center;
        }
        
        /* Sneak-specific styles removed - now using unified styles above */
        
        .sneak-preview-dialog .visibility-change-with-override {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .sneak-preview-dialog .override-icons {
            display: flex;
            gap: 4px;
        }
        
        .sneak-preview-dialog .state-icon {
            width: 24px;
            height: 24px;
            border: 1px solid #6c757d;
            border-radius: 4px;
            background: rgba(108, 117, 125, 0.1);
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }
        
        .sneak-preview-dialog .state-icon:hover {
            background: rgba(108, 117, 125, 0.3);
            border-color: #495057;
            transform: scale(1.1);
        }
        
        .sneak-preview-dialog .state-icon.selected {
            background: #6c757d;
            border-color: #495057;
            color: white;
            box-shadow: 0 0 8px rgba(108, 117, 125, 0.5);
        }
        
        .sneak-preview-dialog .state-icon.calculated-outcome {
            background: rgba(108, 117, 125, 0.3);
            border: 2px solid #6c757d;
            animation: pulse-gray 2s infinite;
        }
        
        .sneak-preview-dialog .sneak-preview-dialog-bulk-actions-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            background: rgba(108, 117, 125, 0.1);
            border-radius: 6px;
            border-top: 1px solid #495057;
        }
        
        .sneak-preview-dialog .sneak-preview-dialog-bulk-actions-info {
            font-size: 12px;
            font-weight: 600;
            color: var(--color-text-primary, #f0f0f0);
        }
        
        /* Sneak dialog changes count styles moved to unified section above */
        
        .sneak-preview-dialog .sneak-preview-dialog-bulk-actions-buttons {
            display: flex;
            gap: 12px;
            flex-wrap: nowrap;
            align-items: center;
        }
        

        
        /* Row Action Buttons */
        .sneak-preview-dialog .row-action-btn {
            background: rgba(108, 117, 125, 0.2);
            color: var(--color-text-primary, #f0f0f0);
            border: 1px solid #6c757d;
            border-radius: 4px;
            padding: 6px 8px;
            margin: 0 2px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 12px;
        }
        
        .sneak-preview-dialog .row-action-btn:hover:not(:disabled) {
            background: rgba(108, 117, 125, 0.4);
            border-color: #495057;
            transform: translateY(-1px);
        }
        
        .sneak-preview-dialog .row-action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .sneak-preview-dialog .row-action-btn.apply-change {
            background: #4caf50;
            border-color: #4caf50;
            color: white;
        }
        
        .sneak-preview-dialog .row-action-btn.apply-change:hover:not(:disabled) {
            background: #45a049;
            border-color: #45a049;
        }
        
        .sneak-preview-dialog .row-action-btn.revert-change {
            background: #ff9800;
            border-color: #ff9800;
            color: white;
        }
        
        .sneak-preview-dialog .row-action-btn.revert-change:hover:not(:disabled) {
            background: #e68900;
            border-color: #e68900;
        }
        
        .sneak-preview-dialog .no-action {
            font-style: italic;
            color: var(--color-text-secondary, #ccc);
            font-size: 12px;
        }
        
        /* All Sneak dialog styles are now unified above */
        
    `;
}
