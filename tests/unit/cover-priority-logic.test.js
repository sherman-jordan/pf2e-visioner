import { CoverDetector } from '../../scripts/cover/auto-cover/CoverDetector.js';

// Helper function to setup common mocks
function setupCommonMocks({
    wallCover = 'standard',
    tokenCover = 'lesser',
    intersectionMode = 'any',
    autoCoverFilterSettings = {
        ignoreUndetected: false,
        ignoreDead: false,
        ignoreAllies: false,
        allowProneBlockers: true,
        attackerAlliance: 'party'
    },
    eligibleBlockers = null,
    elevationBlockers = null,
    tokenCoverOverride = 'lesser'
} = {}) {
    const coverDetector = new CoverDetector();
    const mockAttacker = {
        id: 'attacker-1',
        center: { x: 100, y: 100 },
        getCenter: () => ({ x: 100, y: 100 }),
        actor: { type: 'character', alliance: 'party' },
        document: { x: 100, y: 100, width: 50, height: 50 }
    };
    const mockTarget = {
        id: 'target-1',
        center: { x: 300, y: 100 },
        getCenter: () => ({ x: 300, y: 100 }),
        actor: { type: 'npc', alliance: 'hostile' },
        document: { x: 300, y: 100, width: 50, height: 50 }
    };
    const mockBlockers = [{
        id: 'blocker-1',
        center: { x: 200, y: 100 },
        getCenter: () => ({ x: 200, y: 100 }),
        actor: { type: 'npc', alliance: 'hostile' },
        document: { x: 200, y: 100, width: 50, height: 50 }
    }];
    // Use provided blockers or defaults
    const blockers = eligibleBlockers || mockBlockers;
    const elevationFilteredBlockers = elevationBlockers || mockBlockers;
    jest.spyOn(coverDetector, '_evaluateWallsCover').mockReturnValue(wallCover);
    jest.spyOn(coverDetector, '_evaluateCreatureSizeCover').mockReturnValue(tokenCover);
    jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue(intersectionMode);
    jest.spyOn(coverDetector, '_getAutoCoverFilterSettings').mockReturnValue(autoCoverFilterSettings);
    jest.spyOn(coverDetector, '_getEligibleBlockingTokens').mockReturnValue(blockers);
    jest.spyOn(coverDetector, '_filterBlockersByElevation').mockReturnValue(elevationFilteredBlockers);
    jest.spyOn(coverDetector, '_applyTokenCoverOverrides').mockReturnValue(tokenCoverOverride);
    return { coverDetector, mockAttacker, mockTarget, mockBlockers };
}

describe('Cover Priority Logic', () => {

    describe('Simplified Priority Rule', () => {
        it('should prioritize wall cover when walls provide any cover', () => {
            const { coverDetector, mockAttacker, mockTarget } = setupCommonMocks({
                wallCover: 'standard',
                tokenCover: 'lesser',
                intersectionMode: 'any',
                autoCoverFilterSettings: {
                    ignoreUndetected: false,
                    ignoreDead: false,
                    ignoreAllies: false,
                    allowProneBlockers: true,
                    attackerAlliance: 'party'
                },
                tokenCoverOverride: 'lesser'
            });
            const result = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);
            expect(result).toBe('standard');
        });

        it('should prioritize wall cover when walls provide greater cover', () => {
            const { coverDetector, mockAttacker, mockTarget } = setupCommonMocks({
                wallCover: 'greater',
                tokenCover: 'standard',
                intersectionMode: 'any',
                autoCoverFilterSettings: {
                    ignoreUndetected: false,
                    ignoreDead: false,
                    ignoreAllies: false,
                    allowProneBlockers: true,
                    attackerAlliance: 'party'
                },
                tokenCoverOverride: 'standard'
            });
            const result = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);
            expect(result).toBe('greater');
        });

        it('should prioritize wall cover when walls provide lesser cover', () => {
            // Mock wall cover evaluation to return 'lesser'
            jest.spyOn(coverDetector, '_evaluateWallsCover').mockReturnValue('lesser');
            
            // Mock token cover evaluation to return 'standard'
            jest.spyOn(coverDetector, '_evaluateCreatureSizeCover').mockReturnValue('standard');
            
            // Mock other required methods
            jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue('any');
            jest.spyOn(coverDetector, '_getAutoCoverFilterSettings').mockReturnValue({
                ignoreUndetected: false,
                ignoreDead: false,
                ignoreAllies: false,
                allowProneBlockers: true,
                attackerAlliance: 'party'
            });
            jest.spyOn(coverDetector, '_getEligibleBlockingTokens').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_filterBlockersByElevation').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_applyTokenCoverOverrides').mockReturnValue('standard');

            const result = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);
            
            expect(result).toBe('lesser');
        });

        it('should prioritize token cover when walls provide no cover', () => {
            // Mock wall cover evaluation to return 'none'
            jest.spyOn(coverDetector, '_evaluateWallsCover').mockReturnValue('none');
            
            // Mock token cover evaluation to return 'standard'
            jest.spyOn(coverDetector, '_evaluateCreatureSizeCover').mockReturnValue('standard');
            
            // Mock other required methods
            jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue('any');
            jest.spyOn(coverDetector, '_getAutoCoverFilterSettings').mockReturnValue({
                ignoreUndetected: false,
                ignoreDead: false,
                ignoreAllies: false,
                allowProneBlockers: true,
                attackerAlliance: 'party'
            });
            jest.spyOn(coverDetector, '_getEligibleBlockingTokens').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_filterBlockersByElevation').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_applyTokenCoverOverrides').mockReturnValue('standard');

            const result = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);
            
            expect(result).toBe('standard');
        });

        it('should prioritize token cover when walls provide no cover and tokens provide greater cover', () => {
            // Mock wall cover evaluation to return 'none'
            jest.spyOn(coverDetector, '_evaluateWallsCover').mockReturnValue('none');
            
            // Mock token cover evaluation to return 'greater'
            jest.spyOn(coverDetector, '_evaluateCreatureSizeCover').mockReturnValue('greater');
            
            // Mock other required methods
            jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue('any');
            jest.spyOn(coverDetector, '_getAutoCoverFilterSettings').mockReturnValue({
                ignoreUndetected: false,
                ignoreDead: false,
                ignoreAllies: false,
                allowProneBlockers: true,
                attackerAlliance: 'party'
            });
            jest.spyOn(coverDetector, '_getEligibleBlockingTokens').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_filterBlockersByElevation').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_applyTokenCoverOverrides').mockReturnValue('greater');

            const result = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);
            
            expect(result).toBe('greater');
        });

        it('should return none when both walls and tokens provide no cover', () => {
            // Mock wall cover evaluation to return 'none'
            jest.spyOn(coverDetector, '_evaluateWallsCover').mockReturnValue('none');
            
            // Mock token cover evaluation to return 'none'
            jest.spyOn(coverDetector, '_evaluateCreatureSizeCover').mockReturnValue('none');
            
            // Mock other required methods
            jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue('any');
            jest.spyOn(coverDetector, '_getAutoCoverFilterSettings').mockReturnValue({
                ignoreUndetected: false,
                ignoreDead: false,
                ignoreAllies: false,
                allowProneBlockers: true,
                attackerAlliance: 'party'
            });
            jest.spyOn(coverDetector, '_getEligibleBlockingTokens').mockReturnValue([]);
            jest.spyOn(coverDetector, '_filterBlockersByElevation').mockReturnValue([]);
            jest.spyOn(coverDetector, '_applyTokenCoverOverrides').mockReturnValue('none');

            const result = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);
            
            expect(result).toBe('none');
        });
    });

    describe('Edge Cases', () => {
        it('should handle same token as attacker and target', () => {
            const result = coverDetector.detectBetweenTokens(mockAttacker, mockAttacker);
            expect(result).toBe('none');
        });

        it('should handle null attacker', () => {
            const result = coverDetector.detectBetweenTokens(null, mockTarget);
            expect(result).toBe('none');
        });

        it('should handle null target', () => {
            const result = coverDetector.detectBetweenTokens(mockAttacker, null);
            expect(result).toBe('none');
        });

        it('should handle error in cover evaluation gracefully', () => {
            // Mock wall cover evaluation to throw an error
            jest.spyOn(coverDetector, '_evaluateWallsCover').mockImplementation(() => {
                throw new Error('Wall evaluation error');
            });
            
            // Mock other required methods
            jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue('any');
            jest.spyOn(coverDetector, '_getAutoCoverFilterSettings').mockReturnValue({
                ignoreUndetected: false,
                ignoreDead: false,
                ignoreAllies: false,
                allowProneBlockers: true,
                attackerAlliance: 'party'
            });
            jest.spyOn(coverDetector, '_getEligibleBlockingTokens').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_filterBlockersByElevation').mockReturnValue(mockBlockers);

            const result = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);
            expect(result).toBe('none');
        });
    });

    describe('Different Intersection Modes', () => {
        it('should work with tactical mode', () => {
            // Mock wall cover evaluation to return 'none'
            jest.spyOn(coverDetector, '_evaluateWallsCover').mockReturnValue('none');
            
            // Mock tactical cover evaluation to return 'standard'
            jest.spyOn(coverDetector, '_evaluateCoverByTactical').mockReturnValue('standard');
            
            // Mock other required methods
            jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue('tactical');
            jest.spyOn(coverDetector, '_getAutoCoverFilterSettings').mockReturnValue({
                ignoreUndetected: false,
                ignoreDead: false,
                ignoreAllies: false,
                allowProneBlockers: true,
                attackerAlliance: 'party'
            });
            jest.spyOn(coverDetector, '_getEligibleBlockingTokens').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_filterBlockersByElevation').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_applyTokenCoverOverrides').mockReturnValue('standard');

            const result = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);
            
            expect(result).toBe('standard');
        });

        it('should work with coverage mode', () => {
            // Mock wall cover evaluation to return 'none'
            jest.spyOn(coverDetector, '_evaluateWallsCover').mockReturnValue('none');
            
            // Mock coverage cover evaluation to return 'greater'
            jest.spyOn(coverDetector, '_evaluateCoverByCoverage').mockReturnValue('greater');
            
            // Mock other required methods
            jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue('coverage');
            jest.spyOn(coverDetector, '_getAutoCoverFilterSettings').mockReturnValue({
                ignoreUndetected: false,
                ignoreDead: false,
                ignoreAllies: false,
                allowProneBlockers: true,
                attackerAlliance: 'party'
            });
            jest.spyOn(coverDetector, '_getEligibleBlockingTokens').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_filterBlockersByElevation').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_applyTokenCoverOverrides').mockReturnValue('greater');

            const result = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);
            
            expect(result).toBe('greater');
        });
    });

    describe('Token Cover Overrides', () => {
        it('should apply token cover overrides correctly', () => {
            // Mock wall cover evaluation to return 'none'
            jest.spyOn(coverDetector, '_evaluateWallsCover').mockReturnValue('none');
            
            // Mock token cover evaluation to return 'lesser'
            jest.spyOn(coverDetector, '_evaluateCreatureSizeCover').mockReturnValue('lesser');
            
            // Mock token cover overrides to return 'standard'
            jest.spyOn(coverDetector, '_applyTokenCoverOverrides').mockReturnValue('standard');
            
            // Mock other required methods
            jest.spyOn(coverDetector, '_getIntersectionMode').mockReturnValue('any');
            jest.spyOn(coverDetector, '_getAutoCoverFilterSettings').mockReturnValue({
                ignoreUndetected: false,
                ignoreDead: false,
                ignoreAllies: false,
                allowProneBlockers: true,
                attackerAlliance: 'party'
            });
            jest.spyOn(coverDetector, '_getEligibleBlockingTokens').mockReturnValue(mockBlockers);
            jest.spyOn(coverDetector, '_filterBlockersByElevation').mockReturnValue(mockBlockers);

            const result = coverDetector.detectBetweenTokens(mockAttacker, mockTarget);
            
            expect(result).toBe('standard');
        });
    });
});
