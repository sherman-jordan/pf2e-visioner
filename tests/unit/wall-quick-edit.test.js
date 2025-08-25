import { JSDOM } from 'jsdom';

// Mock Foundry globals
const mockGame = {
  settings: {
    get: () => true
  }
};

// Set up global mocks
global.game = mockGame;
global.document = new JSDOM().window.document;

describe('Wall Quick Edit', () => {
  describe('Hidden Wall Sections', () => {
    beforeEach(() => {
      // Set up a mock DOM for testing
      document.body.innerHTML = `
        <form class="pv-wall-quick">
          <div class="form-group">
            <input type="checkbox" name="hiddenWall" />
          </div>
          <div class="form-group hidden-wall-section" style="display: none;">
            <label>Wall Identifier</label>
            <input type="text" name="identifier" />
          </div>
          <div class="form-group hidden-wall-section" style="display: none;">
            <label>Wall Stealth DC</label>
            <input type="number" name="dc" />
          </div>
          <div class="form-group hidden-wall-section" style="display: none;">
            <label>Connected Walls</label>
            <input type="text" name="connected" />
          </div>
        </form>
      `;
    });

    it('should hide hidden wall sections by default', () => {
      const sections = document.querySelectorAll('.hidden-wall-section');
      sections.forEach(section => {
        expect(section.style.display).toBe('none');
      });
    });

    it('should show hidden wall sections when checkbox is checked', () => {
      const checkbox = document.querySelector('input[name="hiddenWall"]');
      const sections = document.querySelectorAll('.hidden-wall-section');
      
      // Simulate checking the checkbox
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
      
      sections.forEach(section => {
        expect(section.style.display).toBe('');
      });
    });

    it('should hide hidden wall sections when checkbox is unchecked', () => {
      const checkbox = document.querySelector('input[name="hiddenWall"]');
      const sections = document.querySelectorAll('.hidden-wall-section');
      
      // First show the sections
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
      
      // Then hide them again
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
      
      sections.forEach(section => {
        expect(section.style.display).toBe('none');
      });
    });
  });
});