/**
 * Tests for lib/external_id_matcher.js
 * @jest-environment node
 */

const externalIdMatcher = require('../lib/external_id_matcher');
const search = require('../../../shared/mocks/search');
const record = require('../../../shared/mocks/record');

describe('External ID Matcher', () => {
    let mockSearch;

    beforeEach(() => {
        // Clear cache before each test
        externalIdMatcher.clearCache();

        // Create a mock search that will be returned by search.create
        mockSearch = new search.Search();

        // Mock search.create to return our mock search
        search.create = jest.fn(() => mockSearch);
    });

    describe('findByExternalId', () => {
        test('should find record by external ID', () => {
            // Set mock results on the search
            mockSearch._setMockResults([
                { id: '123', values: { internalid: '123', externalid: 'EXT-123' } }
            ]);

            const result = externalIdMatcher.findByExternalId('customer', 'EXT-123');

            expect(result).toBe('123');
            expect(search.create).toHaveBeenCalled();
        });

        test('should return null when record not found', () => {
            mockSearch._setMockResults([]);

            const result = externalIdMatcher.findByExternalId('customer', 'NOT-FOUND');

            expect(result).toBeNull();
        });

        test('should use cache on second lookup', () => {
            mockSearch._setMockResults([
                { id: '123', values: { internalid: '123', externalid: 'EXT-123' } }
            ]);

            // First call - should search
            externalIdMatcher.findByExternalId('customer', 'EXT-123');
            expect(search.create).toHaveBeenCalledTimes(1);

            search.create.mockClear();

            // Second call - should use cache
            const result = externalIdMatcher.findByExternalId('customer', 'EXT-123');
            expect(result).toBe('123');
            expect(search.create).not.toHaveBeenCalled();
        });

        test('should bypass cache when useCache is false', () => {
            mockSearch._setMockResults([
                { id: '123', values: { internalid: '123', externalid: 'EXT-123' } }
            ]);

            // First call with cache
            externalIdMatcher.findByExternalId('customer', 'EXT-123', true);
            search.create.mockClear();

            // Second call without cache
            externalIdMatcher.findByExternalId('customer', 'EXT-123', false);
            expect(search.create).toHaveBeenCalledTimes(1);
        });
    });

    describe('findOrCreate', () => {
        test('should return existing record when found', () => {
            search.mockSearchResults([
                { id: '123', values: { internalid: '123', externalid: 'EXT-123' } }
            ]);

            const result = externalIdMatcher.findOrCreate('customer', 'EXT-123', {
                companyname: 'Test Company'
            });

            expect(result.id).toBe('123');
            expect(result.created).toBe(false);
            expect(record.create).not.toHaveBeenCalled();
        });

        test('should create new record when not found', () => {
            search.mockSearchResults([]);
            record.mockRecordId('999');

            const result = externalIdMatcher.findOrCreate('customer', 'NEW-EXT-123', {
                companyname: 'New Company',
                subsidiary: '1'
            });

            expect(result.id).toBe('999');
            expect(result.created).toBe(true);
            expect(record.create).toHaveBeenCalledWith({
                type: 'customer',
                isDynamic: false
            });
        });

        test('should set external ID and default values on new record', () => {
            search.mockSearchResults([]);
            const mockRec = record.mockRecord();

            externalIdMatcher.findOrCreate('customer', 'NEW-123', {
                companyname: 'Test Co',
                email: 'test@example.com'
            });

            expect(mockRec.setValue).toHaveBeenCalledWith({
                fieldId: 'externalid',
                value: 'NEW-123'
            });

            expect(mockRec.setValue).toHaveBeenCalledWith({
                fieldId: 'companyname',
                value: 'Test Co'
            });

            expect(mockRec.setValue).toHaveBeenCalledWith({
                fieldId: 'email',
                value: 'test@example.com'
            });
        });
    });

    describe('batchFind', () => {
        test('should find multiple records by external ID', () => {
            search.mockSearchResults([
                { id: '123', values: { externalid: 'EXT-123' } },
                { id: '456', values: { externalid: 'EXT-456' } }
            ]);

            const result = externalIdMatcher.batchFind('customer', ['EXT-123', 'EXT-456', 'NOT-FOUND']);

            expect(result['EXT-123']).toBe('123');
            expect(result['EXT-456']).toBe('456');
            expect(result['NOT-FOUND']).toBeUndefined();
        });

        test('should use cache for batch find', () => {
            // Pre-populate cache
            search.mockSearchResults([
                { id: '123', values: { externalid: 'EXT-123' } }
            ]);
            externalIdMatcher.findByExternalId('customer', 'EXT-123');

            jest.clearAllMocks();

            // Batch find with cached and uncached IDs
            search.mockSearchResults([
                { id: '456', values: { externalid: 'EXT-456' } }
            ]);

            const result = externalIdMatcher.batchFind('customer', ['EXT-123', 'EXT-456']);

            expect(result['EXT-123']).toBe('123'); // From cache
            expect(result['EXT-456']).toBe('456'); // From search
            expect(search.create).toHaveBeenCalledTimes(1);
        });

        test('should return empty object for empty input', () => {
            const result = externalIdMatcher.batchFind('customer', []);
            expect(result).toEqual({});
        });
    });

    describe('clearCache', () => {
        test('should clear cache for specific record type', () => {
            search.mockSearchResults([
                { id: '123', values: { externalid: 'EXT-123' } }
            ]);

            externalIdMatcher.findByExternalId('customer', 'EXT-123');
            jest.clearAllMocks();

            externalIdMatcher.clearCache('customer');

            // Should search again after cache clear
            externalIdMatcher.findByExternalId('customer', 'EXT-123');
            expect(search.create).toHaveBeenCalled();
        });

        test('should clear entire cache when no type specified', () => {
            search.mockSearchResults([
                { id: '123', values: { externalid: 'EXT-123' } }
            ]);

            externalIdMatcher.findByExternalId('customer', 'EXT-123');
            externalIdMatcher.findByExternalId('salesorder', 'SO-123');

            externalIdMatcher.clearCache();

            jest.clearAllMocks();

            // Both should search again
            externalIdMatcher.findByExternalId('customer', 'EXT-123');
            externalIdMatcher.findByExternalId('salesorder', 'SO-123');
            expect(search.create).toHaveBeenCalledTimes(2);
        });
    });
});
