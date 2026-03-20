/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Integration Pipeline - Segmentation Module
 *
 * Groups incoming records by configurable keys for efficient batch processing.
 * Segmentation strategies vary by entity type to optimize processing performance.
 *
 * Common segmentation patterns:
 * - Invoice: vendor + date (group invoices from same vendor on same day)
 * - Sales Order: customer + ship_date
 * - Journal Entry: period + department
 */
(function(factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD (NetSuite)
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS (Jest)
        module.exports = factory();
    }
})(function() {
    'use strict';

    /**
     * Segmentation strategy definitions
     * Maps entity type to field extraction logic
     */
    const SEGMENTATION_STRATEGIES = {
        invoice: function(payload) {
            const vendorId = payload.vendor_id || payload.vendor_internal_id || 'unknown';
            const invoiceDate = payload.invoice_date ? payload.invoice_date.substring(0, 10) : 'unknown';
            return 'invoice|' + vendorId + '|' + invoiceDate;
        },

        vendor: function(payload) {
            // Group all vendors together (no specific segmentation needed)
            return 'vendor|batch';
        },

        sales_order: function(payload) {
            const customerId = payload.customer_id || payload.customer_internal_id || 'unknown';
            const shipDate = payload.ship_date ? payload.ship_date.substring(0, 10) : 'unknown';
            return 'sales_order|' + customerId + '|' + shipDate;
        },

        journal_entry: function(payload) {
            const period = payload.posting_period || 'unknown';
            const department = payload.department_id || 'unknown';
            return 'journal_entry|' + period + '|' + department;
        },

        default: function(payload) {
            return 'default|batch';
        }
    };

    /**
     * Generate segmentation key for a record
     *
     * @param {string} entityType - Entity type (invoice, vendor, sales_order, etc.)
     * @param {Object} payload - Record payload
     * @returns {string} - Segmentation key
     *
     * @example
     * generateKey('invoice', { vendor_id: 'V-123', invoice_date: '2026-03-15' })
     * // Returns: 'invoice|V-123|2026-03-15'
     */
    function generateKey(entityType, payload) {
        if (!entityType || typeof entityType !== 'string') {
            throw new Error('Entity type must be a non-empty string');
        }

        if (!payload || typeof payload !== 'object') {
            throw new Error('Payload must be an object');
        }

        const strategy = SEGMENTATION_STRATEGIES[entityType] || SEGMENTATION_STRATEGIES.default;
        return strategy(payload);
    }

    /**
     * Parse segmentation key back into components
     *
     * @param {string} key - Segmentation key
     * @returns {Object} - Parsed components
     *
     * @example
     * parseKey('invoice|V-123|2026-03-15')
     * // Returns: { entityType: 'invoice', segments: ['V-123', '2026-03-15'] }
     */
    function parseKey(key) {
        if (!key || typeof key !== 'string') {
            throw new Error('Key must be a non-empty string');
        }

        const parts = key.split('|');
        if (parts.length < 2) {
            throw new Error('Invalid segmentation key format: ' + key);
        }

        return {
            entityType: parts[0],
            segments: parts.slice(1)
        };
    }

    /**
     * Group records by segmentation key
     *
     * @param {Array<Object>} records - Array of records with entityType and payload
     * @returns {Object} - Map of segmentation keys to record arrays
     *
     * @example
     * groupRecords([
     *   { entityType: 'invoice', payload: { vendor_id: 'V-123', invoice_date: '2026-03-15' } },
     *   { entityType: 'invoice', payload: { vendor_id: 'V-123', invoice_date: '2026-03-15' } },
     *   { entityType: 'invoice', payload: { vendor_id: 'V-456', invoice_date: '2026-03-16' } }
     * ])
     * // Returns:
     * // {
     * //   'invoice|V-123|2026-03-15': [record1, record2],
     * //   'invoice|V-456|2026-03-16': [record3]
     * // }
     */
    function groupRecords(records) {
        if (!Array.isArray(records)) {
            throw new Error('Records must be an array');
        }

        const grouped = {};

        for (let i = 0; i < records.length; i++) {
            const rec = records[i];

            if (!rec.entityType || !rec.payload) {
                throw new Error('Record at index ' + i + ' missing entityType or payload');
            }

            const key = generateKey(rec.entityType, rec.payload);

            if (!grouped[key]) {
                grouped[key] = [];
            }

            grouped[key].push(rec);
        }

        return grouped;
    }

    /**
     * Register a custom segmentation strategy
     *
     * @param {string} entityType - Entity type name
     * @param {Function} strategyFn - Function that returns segmentation key
     *
     * @example
     * registerStrategy('custom_transaction', function(payload) {
     *   return 'custom|' + payload.category + '|' + payload.region;
     * });
     */
    function registerStrategy(entityType, strategyFn) {
        if (!entityType || typeof entityType !== 'string') {
            throw new Error('Entity type must be a non-empty string');
        }

        if (typeof strategyFn !== 'function') {
            throw new Error('Strategy must be a function');
        }

        SEGMENTATION_STRATEGIES[entityType] = strategyFn;
    }

    return {
        generateKey: generateKey,
        parseKey: parseKey,
        groupRecords: groupRecords,
        registerStrategy: registerStrategy
    };
});
