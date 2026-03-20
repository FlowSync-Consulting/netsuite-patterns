/**
 * @NApiVersion 2.1
 * @description Line item grouper - groups line items by category for organized PDF display
 */
define(['N/log'], (log) => {

    /**
     * Group line items by category
     * @param {Array<Object>} lineItems - Line items from data source
     * @returns {Array<Object>} Grouped line items with subtotals
     */
    function groupByCategory(lineItems) {
        if (!lineItems || lineItems.length === 0) {
            return [];
        }

        log.debug('Grouping Line Items', { count: lineItems.length });

        // Build groups map
        const groups = {};

        lineItems.forEach(item => {
            const category = item.category || 'General';

            if (!groups[category]) {
                groups[category] = {
                    category: category,
                    items: [],
                    subtotal: 0
                };
            }

            groups[category].items.push(item);

            // Parse amount and add to subtotal
            const amount = parseAmount(item.amount);
            groups[category].subtotal += amount;
        });

        // Convert map to array and format subtotals
        const groupedArray = Object.keys(groups).map(category => {
            const group = groups[category];
            return {
                category: group.category,
                items: group.items,
                subtotal: formatCurrency(group.subtotal),
                subtotalRaw: group.subtotal
            };
        });

        // Sort groups by category name
        groupedArray.sort((a, b) => a.category.localeCompare(b.category));

        log.debug('Grouped Line Items', {
            groups: groupedArray.length,
            categories: groupedArray.map(g => g.category)
        });

        return groupedArray;
    }

    /**
     * Group line items by item type
     * @param {Array<Object>} lineItems
     * @returns {Array<Object>}
     */
    function groupByItemType(lineItems) {
        if (!lineItems || lineItems.length === 0) {
            return [];
        }

        // Categorize by item type (inventory, service, non-inventory)
        const groups = {
            inventory: { category: 'Products', items: [], subtotal: 0 },
            service: { category: 'Services', items: [], subtotal: 0 },
            other: { category: 'Other Items', items: [], subtotal: 0 }
        };

        lineItems.forEach(item => {
            // Determine item type from item name or description
            // In production, you would look up item type from item record
            const itemType = determineItemType(item);
            const amount = parseAmount(item.amount);

            groups[itemType].items.push(item);
            groups[itemType].subtotal += amount;
        });

        // Convert to array, exclude empty groups, format subtotals
        const groupedArray = Object.keys(groups)
            .map(key => groups[key])
            .filter(group => group.items.length > 0)
            .map(group => ({
                category: group.category,
                items: group.items,
                subtotal: formatCurrency(group.subtotal),
                subtotalRaw: group.subtotal
            }));

        return groupedArray;
    }

    /**
     * Group line items by department
     * @param {Array<Object>} lineItems
     * @returns {Array<Object>}
     */
    function groupByDepartment(lineItems) {
        if (!lineItems || lineItems.length === 0) {
            return [];
        }

        const groups = {};

        lineItems.forEach(item => {
            const department = item.department || 'Unassigned';

            if (!groups[department]) {
                groups[department] = {
                    category: department,
                    items: [],
                    subtotal: 0
                };
            }

            groups[department].items.push(item);
            groups[department].subtotal += parseAmount(item.amount);
        });

        return Object.keys(groups).map(dept => {
            const group = groups[dept];
            return {
                category: group.category,
                items: group.items,
                subtotal: formatCurrency(group.subtotal),
                subtotalRaw: group.subtotal
            };
        }).sort((a, b) => a.category.localeCompare(b.category));
    }

    /**
     * Determine item type from item data
     * @param {Object} item
     * @returns {string} 'inventory', 'service', or 'other'
     */
    function determineItemType(item) {
        const itemName = (item.item.name || '').toLowerCase();
        const description = (item.item.description || '').toLowerCase();

        // Simple heuristic - in production, lookup actual item type
        if (itemName.indexOf('service') >= 0 || description.indexOf('service') >= 0) {
            return 'service';
        }

        if (itemName.indexOf('product') >= 0 || itemName.indexOf('sku') >= 0) {
            return 'inventory';
        }

        return 'other';
    }

    /**
     * Parse amount string to number
     * @param {string|number} amount - Amount as string (e.g., "$1,234.56") or number
     * @returns {number}
     */
    function parseAmount(amount) {
        if (typeof amount === 'number') {
            return amount;
        }

        if (typeof amount === 'string') {
            // Remove currency symbols and commas
            const cleaned = amount.replace(/[$,]/g, '');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
        }

        return 0;
    }

    /**
     * Format currency for display
     * @param {number} amount
     * @returns {string}
     */
    function formatCurrency(amount) {
        if (!amount && amount !== 0) {
            return '$0.00';
        }

        return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /**
     * Calculate grand total from grouped items
     * @param {Array<Object>} groupedItems
     * @returns {string}
     */
    function calculateGrandTotal(groupedItems) {
        if (!groupedItems || groupedItems.length === 0) {
            return '$0.00';
        }

        const total = groupedItems.reduce((sum, group) => {
            return sum + (group.subtotalRaw || 0);
        }, 0);

        return formatCurrency(total);
    }

    return {
        groupByCategory: groupByCategory,
        groupByItemType: groupByItemType,
        groupByDepartment: groupByDepartment,
        calculateGrandTotal: calculateGrandTotal
    };
});
