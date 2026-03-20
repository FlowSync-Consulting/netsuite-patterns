/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Field Service API - External ID Matcher
 *
 * Matches external system IDs to NetSuite internal IDs with caching for performance.
 * Implements the create-if-not-found pattern for idempotent upserts.
 */
(function(factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD (NetSuite)
        define(['N/search', 'N/record', 'N/log'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS (Jest)
        const search = require('../../../shared/mocks/search');
        const record = require('../../../shared/mocks/record');
        const log = require('../../../shared/mocks/log');
        module.exports = factory(search, record, log);
    }
})(function(search, record, log) {
    'use strict';

    /**
     * In-memory cache for external ID lookups
     * Structure: { recordType: { externalId: internalId } }
     */
    const _cache = {};

    /**
     * Find NetSuite internal ID by external ID
     *
     * @param {string} recordType - NetSuite record type (e.g., 'customer', 'salesorder')
     * @param {string} externalId - External system identifier
     * @param {boolean} [useCache=true] - Whether to use cache
     * @returns {string|null} - NetSuite internal ID or null if not found
     *
     * @example
     * const customerId = findByExternalId('customer', 'EXT-CUST-123');
     * if (!customerId) {
     *   // Customer doesn't exist
     * }
     */
    function findByExternalId(recordType, externalId, useCache) {
        if (!recordType || !externalId) {
            log.error('findByExternalId', 'Missing recordType or externalId');
            return null;
        }

        // Default useCache to true
        if (useCache === undefined || useCache === null) {
            useCache = true;
        }

        // Check cache first
        if (useCache && _cache[recordType] && _cache[recordType][externalId]) {
            log.debug('findByExternalId', 'Cache hit: ' + recordType + ' / ' + externalId);
            return _cache[recordType][externalId];
        }

        try {
            const searchObj = search.create({
                type: recordType,
                filters: [
                    ['externalid', search.Operator.IS, externalId]
                ],
                columns: ['internalid']
            });

            const results = searchObj.run().getRange({ start: 0, end: 1 });

            if (results && results.length > 0) {
                const internalId = results[0].id;

                // Cache the result
                if (useCache) {
                    if (!_cache[recordType]) {
                        _cache[recordType] = {};
                    }
                    _cache[recordType][externalId] = internalId;
                }

                log.debug('findByExternalId', 'Found: ' + recordType + ' / ' + externalId + ' -> ' + internalId);
                return internalId;
            }

            log.debug('findByExternalId', 'Not found: ' + recordType + ' / ' + externalId);
            return null;
        } catch (err) {
            log.error('findByExternalId', 'Error finding ' + recordType + ' with externalId ' + externalId + ': ' + err.message);
            return null;
        }
    }

    /**
     * Find or create a record by external ID (idempotent upsert pattern)
     *
     * @param {string} recordType - NetSuite record type
     * @param {string} externalId - External system identifier
     * @param {Object} defaultValues - Default field values for record creation
     * @returns {Object} - { id: internalId, created: boolean }
     *
     * @example
     * const result = findOrCreate('customer', 'EXT-CUST-123', {
     *   companyname: 'Example Corp',
     *   subsidiary: 1
     * });
     * // result.id is the internal ID (existing or newly created)
     * // result.created is true if record was created, false if it already existed
     */
    function findOrCreate(recordType, externalId, defaultValues) {
        if (!recordType || !externalId) {
            throw new Error('Missing recordType or externalId');
        }

        // Try to find existing record
        const existingId = findByExternalId(recordType, externalId);

        if (existingId) {
            log.debug('findOrCreate', 'Record exists: ' + recordType + ' / ' + externalId + ' -> ' + existingId);
            return {
                id: existingId,
                created: false
            };
        }

        // Create new record
        try {
            const rec = record.create({
                type: recordType,
                isDynamic: false
            });

            // Set external ID
            rec.setValue({
                fieldId: 'externalid',
                value: externalId
            });

            // Set default values
            if (defaultValues && typeof defaultValues === 'object') {
                for (const fieldId in defaultValues) {
                    if (defaultValues.hasOwnProperty(fieldId)) {
                        rec.setValue({
                            fieldId: fieldId,
                            value: defaultValues[fieldId]
                        });
                    }
                }
            }

            const newId = rec.save({
                enableSourcing: true,
                ignoreMandatoryFields: false
            });

            // Cache the new record
            if (!_cache[recordType]) {
                _cache[recordType] = {};
            }
            _cache[recordType][externalId] = newId;

            log.audit('findOrCreate', 'Created new record: ' + recordType + ' / ' + externalId + ' -> ' + newId);

            return {
                id: newId,
                created: true
            };
        } catch (err) {
            log.error('findOrCreate', 'Error creating ' + recordType + ' with externalId ' + externalId + ': ' + err.message);
            throw err;
        }
    }

    /**
     * Batch find multiple external IDs (optimized for multiple lookups)
     *
     * @param {string} recordType - NetSuite record type
     * @param {Array<string>} externalIds - Array of external IDs to find
     * @returns {Object} - Map of externalId -> internalId (only includes found records)
     *
     * @example
     * const customerMap = batchFind('customer', ['EXT-CUST-123', 'EXT-CUST-456']);
     * // Returns: { 'EXT-CUST-123': '12345', 'EXT-CUST-456': '67890' }
     */
    function batchFind(recordType, externalIds) {
        if (!recordType || !Array.isArray(externalIds) || externalIds.length === 0) {
            log.error('batchFind', 'Invalid parameters');
            return {};
        }

        const resultMap = {};
        const uncachedIds = [];

        // Check cache first
        for (let i = 0; i < externalIds.length; i++) {
            const extId = externalIds[i];
            if (_cache[recordType] && _cache[recordType][extId]) {
                resultMap[extId] = _cache[recordType][extId];
            } else {
                uncachedIds.push(extId);
            }
        }

        // If all IDs were cached, return early
        if (uncachedIds.length === 0) {
            log.debug('batchFind', 'All IDs found in cache');
            return resultMap;
        }

        // Search for uncached IDs
        try {
            const searchObj = search.create({
                type: recordType,
                filters: [
                    ['externalid', search.Operator.ANYOF, uncachedIds]
                ],
                columns: [
                    'internalid',
                    'externalid'
                ]
            });

            searchObj.run().each(function(result) {
                const internalId = result.id;
                const externalId = result.getValue({ name: 'externalid' });

                resultMap[externalId] = internalId;

                // Cache the result
                if (!_cache[recordType]) {
                    _cache[recordType] = {};
                }
                _cache[recordType][externalId] = internalId;

                return true; // Continue iteration
            });

            log.debug('batchFind', 'Found ' + Object.keys(resultMap).length + ' of ' + externalIds.length + ' IDs');

            return resultMap;
        } catch (err) {
            log.error('batchFind', 'Error in batch find: ' + err.message);
            return resultMap;
        }
    }

    /**
     * Clear the cache (useful for testing or when cache invalidation is needed)
     *
     * @param {string} [recordType] - Optional record type to clear (clears all if not specified)
     */
    function clearCache(recordType) {
        if (recordType) {
            delete _cache[recordType];
            log.debug('clearCache', 'Cleared cache for: ' + recordType);
        } else {
            for (const type in _cache) {
                if (_cache.hasOwnProperty(type)) {
                    delete _cache[type];
                }
            }
            log.debug('clearCache', 'Cleared entire cache');
        }
    }

    return {
        findByExternalId: findByExternalId,
        findOrCreate: findOrCreate,
        batchFind: batchFind,
        clearCache: clearCache
    };
});
