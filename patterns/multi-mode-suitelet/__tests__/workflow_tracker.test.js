/**
 * @jest-environment node
 *
 * Tests for main workflow tracker suitelet (mode routing)
 */

const serverWidget = require('../../../shared/mocks/serverWidget');
const runtime = require('../../../shared/mocks/runtime');
const url = require('../../../shared/mocks/url');
const log = require('../../../shared/mocks/log');

// Mock mode modules
const mockEntryMode = {
    buildForm: jest.fn(() => ({ title: 'Entry Form' })),
    processEntry: jest.fn()
};

const mockManagementMode = {
    buildDashboard: jest.fn(() => ({ title: 'Management Dashboard' })),
    processUpdate: jest.fn()
};

const mockBillingMode = {
    buildBillingForm: jest.fn(() => ({ title: 'Billing Form' })),
    processBilling: jest.fn()
};

// Mock AMD define
let workflowTrackerModule;

beforeAll(() => {
    global.define = (dependencies, factory) => {
        const modules = dependencies.map(dep => {
            if (dep === 'N/ui/serverWidget') return serverWidget;
            if (dep === 'N/runtime') return runtime;
            if (dep === 'N/url') return url;
            if (dep === 'N/log') return log;
            if (dep === './modes/entry_mode') return mockEntryMode;
            if (dep === './modes/management_mode') return mockManagementMode;
            if (dep === './modes/billing_mode') return mockBillingMode;
            return {};
        });
        workflowTrackerModule = factory(...modules);
    };

    require('../src/fs_workflow_tracker_sl');
});

describe('Workflow Tracker Suitelet - Mode Routing', () => {
    let mockContext;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        mockContext = {
            request: {
                method: 'GET',
                parameters: {}
            },
            response: {
                writePage: jest.fn()
            }
        };
    });

    describe('GET Request Handling', () => {
        it('should route to entry mode by default (no mode parameter)', () => {
            mockContext.request.parameters = {};

            workflowTrackerModule.onRequest(mockContext);

            expect(mockEntryMode.buildForm).toHaveBeenCalledWith(mockContext);
            expect(mockManagementMode.buildDashboard).not.toHaveBeenCalled();
            expect(mockBillingMode.buildBillingForm).not.toHaveBeenCalled();
        });

        it('should route to entry mode explicitly', () => {
            mockContext.request.parameters = { mode: 'entry' };

            workflowTrackerModule.onRequest(mockContext);

            expect(mockEntryMode.buildForm).toHaveBeenCalledWith(mockContext);
            expect(mockContext.response.writePage).toHaveBeenCalled();
        });

        it('should route to management mode', () => {
            mockContext.request.parameters = { mode: 'manage' };

            workflowTrackerModule.onRequest(mockContext);

            expect(mockManagementMode.buildDashboard).toHaveBeenCalledWith(mockContext);
            expect(mockEntryMode.buildForm).not.toHaveBeenCalled();
        });

        it('should route to billing mode', () => {
            mockContext.request.parameters = { mode: 'billing' };

            workflowTrackerModule.onRequest(mockContext);

            expect(mockBillingMode.buildBillingForm).toHaveBeenCalledWith(mockContext);
            expect(mockEntryMode.buildForm).not.toHaveBeenCalled();
        });

        it('should default to entry mode for invalid mode parameter', () => {
            mockContext.request.parameters = { mode: 'invalid_mode' };

            workflowTrackerModule.onRequest(mockContext);

            expect(mockEntryMode.buildForm).toHaveBeenCalledWith(mockContext);
        });
    });

    describe('POST Request Handling', () => {
        beforeEach(() => {
            mockContext.request.method = 'POST';
        });

        it('should route save_entry action to entry mode', () => {
            mockContext.request.parameters = { custpage_action: 'save_entry' };

            workflowTrackerModule.onRequest(mockContext);

            expect(mockEntryMode.processEntry).toHaveBeenCalledWith(mockContext);
        });

        it('should route save_and_new action to entry mode', () => {
            mockContext.request.parameters = { custpage_action: 'save_and_new' };

            workflowTrackerModule.onRequest(mockContext);

            expect(mockEntryMode.processEntry).toHaveBeenCalledWith(mockContext);
        });

        it('should route update_status action to management mode', () => {
            mockContext.request.parameters = { custpage_action: 'update_status' };

            workflowTrackerModule.onRequest(mockContext);

            expect(mockManagementMode.processUpdate).toHaveBeenCalledWith(mockContext);
        });

        it('should route create_so action to billing mode', () => {
            mockContext.request.parameters = { custpage_action: 'create_so' };

            workflowTrackerModule.onRequest(mockContext);

            expect(mockBillingMode.processBilling).toHaveBeenCalledWith(mockContext);
        });

        it('should route add_to_so action to billing mode', () => {
            mockContext.request.parameters = { custpage_action: 'add_to_so' };

            workflowTrackerModule.onRequest(mockContext);

            expect(mockBillingMode.processBilling).toHaveBeenCalledWith(mockContext);
        });

        // Error handling is managed by the suitelet - no need to test throw
    });
});
