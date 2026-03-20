/**
 * @jest-environment node
 *
 * Tests for Entry Mode module
 */

const serverWidget = require('../../../shared/mocks/serverWidget');
const record = require('../../../shared/mocks/record');
const log = require('../../../shared/mocks/log');

// Mock redirect module
const mockRedirect = {
    toSuitelet: jest.fn(),
    toRecord: jest.fn()
};

// Mock runtime module
const mockRuntime = {
    getCurrentScript: () => ({
        id: 'customscript_test',
        deploymentId: 'customdeploy_test'
    })
};

// Mock record helpers
const mockRecordHelpers = {
    createRecord: jest.fn((type, values) => 123)
};

let entryMode;

beforeAll(() => {
    global.define = (dependencies, factory) => {
        const modules = dependencies.map(dep => {
            if (dep === 'N/ui/serverWidget') return serverWidget;
            if (dep === 'N/redirect') return mockRedirect;
            if (dep === 'N/runtime') return mockRuntime;
            if (dep === 'N/log') return log;
            if (dep === '../lib/record_helpers') return mockRecordHelpers;
            return {};
        });
        entryMode = factory(...modules);
    };

    require('../src/modes/entry_mode');
});

describe('Entry Mode - Form Building', () => {
    let mockContext;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {
            request: {
                parameters: {}
            }
        };
    });

    it('should create form with correct title', () => {
        const form = entryMode.buildForm(mockContext);

        expect(form.title).toBe('Equipment Intake - Data Entry');
    });

    it('should add customer field (required)', () => {
        const form = entryMode.buildForm(mockContext);

        const customerField = form.fields.find(f => f.id === 'custpage_customer');
        expect(customerField).toBeDefined();
        expect(customerField.type).toBe(serverWidget.FieldType.SELECT);
        expect(customerField.isMandatory).toBe(true);
        expect(customerField.source).toBe('customer');
    });

    it('should add serial number field (required)', () => {
        const form = entryMode.buildForm(mockContext);

        const serialField = form.fields.find(f => f.id === 'custpage_serial');
        expect(serialField).toBeDefined();
        expect(serialField.type).toBe(serverWidget.FieldType.TEXT);
        expect(serialField.isMandatory).toBe(true);
        expect(serialField.maxLength).toBe(50);
    });

    it('should add equipment type field (required)', () => {
        const form = entryMode.buildForm(mockContext);

        const boardTypeField = form.fields.find(f => f.id === 'custpage_board_type');
        expect(boardTypeField).toBeDefined();
        expect(boardTypeField.isMandatory).toBe(true);
    });

    it('should add received date field with default value', () => {
        const form = entryMode.buildForm(mockContext);

        const dateField = form.fields.find(f => f.id === 'custpage_received_date');
        expect(dateField).toBeDefined();
        expect(dateField.isMandatory).toBe(true);
        expect(dateField.defaultValue).toBeInstanceOf(Date);
    });

    it('should add hidden action field', () => {
        const form = entryMode.buildForm(mockContext);

        const actionField = form.fields.find(f => f.id === 'custpage_action');
        expect(actionField).toBeDefined();
        expect(actionField.displayType).toBe(serverWidget.FieldDisplayType.HIDDEN);
    });

    it('should attach client script', () => {
        const form = entryMode.buildForm(mockContext);

        expect(form.clientScriptModulePath).toBe('./client_scripts/fs_workflow_entry_cs.js');
    });

    it('should show success message when present in params', () => {
        mockContext.request.parameters = {
            message: 'Entry saved successfully',
            msgtype: 'confirmation'
        };

        const form = entryMode.buildForm(mockContext);

        expect(form.messages.length).toBeGreaterThan(0);
        expect(form.messages[0].type).toBe(serverWidget.MessageType.CONFIRMATION);
    });

    it('should show error message when present in params', () => {
        mockContext.request.parameters = {
            message: 'Error occurred',
            msgtype: 'error'
        };

        const form = entryMode.buildForm(mockContext);

        expect(form.messages.length).toBeGreaterThan(0);
        expect(form.messages[0].type).toBe(serverWidget.MessageType.ERROR);
    });
});

describe('Entry Mode - POST Processing', () => {
    let mockContext;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {
            request: {
                parameters: {
                    custpage_customer: '456',
                    custpage_serial: 'SN-001',
                    custpage_board_type: 'Controller',
                    custpage_received_date: '2026-03-20',
                    custpage_problem_desc: 'Not working',
                    custpage_action: 'save_entry'
                }
            }
        };
    });

    it('should create work entry record with provided values', () => {
        entryMode.processEntry(mockContext);

        expect(mockRecordHelpers.createRecord).toHaveBeenCalledWith(
            'customrecord_fs_work_entry',
            expect.objectContaining({
                custrecord_fs_customer: '456',
                custrecord_fs_serial: 'SN-001',
                custrecord_fs_board_type: 'Controller',
                custrecord_fs_received_date: '2026-03-20',
                custrecord_fs_problem_desc: 'Not working',
                custrecord_fs_status: '1'  // New status
            })
        );
    });

    it('should redirect to created record after save_entry', () => {
        mockContext.request.parameters.custpage_action = 'save_entry';

        entryMode.processEntry(mockContext);

        expect(mockRedirect.toRecord).toHaveBeenCalledWith({
            type: 'customrecord_fs_work_entry',
            id: 123
        });
    });

    it('should redirect to form with success message after save_and_new', () => {
        mockContext.request.parameters.custpage_action = 'save_and_new';

        entryMode.processEntry(mockContext);

        expect(mockRedirect.toSuitelet).toHaveBeenCalledWith(
            expect.objectContaining({
                parameters: expect.objectContaining({
                    mode: 'entry',
                    msgtype: 'confirmation'
                })
            })
        );
    });

    it('should redirect with error if required field missing', () => {
        delete mockContext.request.parameters.custpage_customer;

        entryMode.processEntry(mockContext);

        expect(mockRedirect.toSuitelet).toHaveBeenCalledWith(
            expect.objectContaining({
                parameters: expect.objectContaining({
                    msgtype: 'error'
                })
            })
        );
    });
});
