/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Integration Pipeline - Duplicate Detection Module
 *
 * Prevents duplicate record creation by checking:
 * 1. External ID uniqueness
 * 2. Payload hash comparison (detects resubmitted identical data)
 *
 * Uses crypto-compatible hashing for payload comparison to detect
 * exact duplicates even when external IDs are missing or regenerated.
 */
(function(factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD (NetSuite)
        define(['N/search', 'N/crypto', 'N/encode', 'N/log'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS (Jest)
        const crypto = require('crypto');
        module.exports = factory(
            require('../../../shared/mocks/search'),
            {
                HashAlg: { SHA256: 'sha256' },
                createHash: (config) => {
                    const hash = crypto.createHash('sha256');
                    return {
                        update: (opts) => hash.update(opts.input),
                        digest: (opts) => hash.digest('hex')
                    };
                }
            },
            {
                Encoding: { HEX: 'hex' }
            },
            require('../../../shared/mocks/log')
        );
    }
})(function(search, crypto, encode, log) {
    'use strict';

    /**
     * Entity type to NetSuite record type mapping
     */
    const ENTITY_TYPE_MAP = {
        invoice: 'vendorbill',
        vendor: 'vendor',
        sales_order: 'salesorder',
        customer: 'customer',
        journal_entry: 'journalentry'
    };

    /**
     * Generate SHA-256 hash of payload for duplicate detection
     *
     * @param {Object} payload - Payload to hash
     * @returns {string} - Hex-encoded hash
     */
    function generatePayloadHash(payload) {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Payload must be an object');
        }

        // Normalize payload to consistent string representation
        const normalized = normalizePayload(payload);
        const payloadString = JSON.stringify(normalized);

        // Generate SHA-256 hash
        const hash = crypto.createHash({
            algorithm: crypto.HashAlg.SHA256
        });

        hash.update({ input: payloadString });

        const digest = hash.digest({ outputEncoding: encode.Encoding.HEX });

        return digest;
    }

    /**
     * Normalize payload for consistent hashing
     * Sorts keys, removes nulls, and standardizes date formats
     *
     * @param {Object} payload - Raw payload
     * @returns {Object} - Normalized payload
     */
    function normalizePayload(payload) {
        if (typeof payload !== 'object' || payload === null) {
            return payload;
        }

        if (Array.isArray(payload)) {
            return payload.map(normalizePayload);
        }

        const normalized = {};
        const keys = Object.keys(payload).sort();

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = payload[key];

            // Skip null/undefined values
            if (value === null || value === undefined) {
                continue;
            }

            // Normalize dates to ISO string
            if (value instanceof Date) {
                normalized[key] = value.toISOString();
            } else if (typeof value === 'object') {
                normalized[key] = normalizePayload(value);
            } else {
                normalized[key] = value;
            }
        }

        return normalized;
    }

    /**
     * Check if a duplicate record exists
     *
     * @param {Object} options - Check options
     * @param {string} options.entityType - Entity type (invoice, vendor, etc.)
     * @param {string} [options.externalId] - External ID to check
     * @param {Object} [options.payload] - Payload to hash and compare
     * @returns {Object} - Duplicate check result
     *
     * @example
     * checkDuplicate({
     *   entityType: 'invoice',
     *   externalId: 'INV-2026-001',
     *   payload: { vendor_id: 'V-123', amount: 1000 }
     * })
     * // Returns: { isDuplicate: true, existingRecordId: '456', matchType: 'external_id' }
     */
    function checkDuplicate(options) {
        if (!options || !options.entityType) {
            throw new Error('Entity type is required');
        }

        const recordType = ENTITY_TYPE_MAP[options.entityType];
        if (!recordType) {
            throw new Error('Unsupported entity type: ' + options.entityType);
        }

        // Check 1: External ID match
        if (options.externalId) {
            const externalIdMatch = checkByExternalId(recordType, options.externalId);
            if (externalIdMatch.isDuplicate) {
                return externalIdMatch;
            }
        }

        // Check 2: Payload hash match
        if (options.payload) {
            const payloadHash = generatePayloadHash(options.payload);
            const hashMatch = checkByPayloadHash(recordType, payloadHash);
            if (hashMatch.isDuplicate) {
                return hashMatch;
            }
        }

        return {
            isDuplicate: false,
            existingRecordId: null,
            matchType: null
        };
    }

    /**
     * Check for duplicate by external ID
     *
     * @param {string} recordType - NetSuite record type
     * @param {string} externalId - External ID
     * @returns {Object} - Duplicate result
     */
    function checkByExternalId(recordType, externalId) {
        const externalIdSearch = search.create({
            type: recordType,
            filters: [
                ['externalid', search.Operator.IS, externalId],
                'AND',
                ['isinactive', search.Operator.IS, 'F']
            ],
            columns: ['internalid']
        });

        const results = externalIdSearch.run().getRange({ start: 0, end: 1 });

        if (results && results.length > 0) {
            return {
                isDuplicate: true,
                existingRecordId: results[0].id,
                matchType: 'external_id'
            };
        }

        return {
            isDuplicate: false,
            existingRecordId: null,
            matchType: null
        };
    }

    /**
     * Check for duplicate by payload hash
     * Requires custom field 'custbody_payload_hash' on target records
     *
     * @param {string} recordType - NetSuite record type
     * @param {string} payloadHash - Payload hash
     * @returns {Object} - Duplicate result
     */
    function checkByPayloadHash(recordType, payloadHash) {
        try {
            const hashSearch = search.create({
                type: recordType,
                filters: [
                    ['custbody_payload_hash', search.Operator.IS, payloadHash],
                    'AND',
                    ['isinactive', search.Operator.IS, 'F']
                ],
                columns: ['internalid']
            });

            const results = hashSearch.run().getRange({ start: 0, end: 1 });

            if (results && results.length > 0) {
                return {
                    isDuplicate: true,
                    existingRecordId: results[0].id,
                    matchType: 'payload_hash'
                };
            }
        } catch (err) {
            // Field doesn't exist - skip hash check
            log.debug({
                title: 'Payload hash field not available',
                details: 'Record type: ' + recordType
            });
        }

        return {
            isDuplicate: false,
            existingRecordId: null,
            matchType: null
        };
    }

    /**
     * Store payload hash on a record for future duplicate detection
     *
     * @param {Object} recordObj - NetSuite record object
     * @param {Object} payload - Original payload
     */
    function storePayloadHash(recordObj, payload) {
        try {
            const hash = generatePayloadHash(payload);
            recordObj.setValue({
                fieldId: 'custbody_payload_hash',
                value: hash
            });
        } catch (err) {
            // Field doesn't exist - skip storage
            log.debug({
                title: 'Cannot store payload hash',
                details: err.message
            });
        }
    }

    return {
        checkDuplicate: checkDuplicate,
        generatePayloadHash: generatePayloadHash,
        storePayloadHash: storePayloadHash,
        normalizePayload: normalizePayload
    };
});
