/**
 * @jest-environment node
 */

const serverWidget = require('../../../shared/mocks/serverWidget');

// Mock AMD define for testing
let ConfigDrivenFormBuilder;

beforeAll(() => {
    global.define = (dependencies, factory) => {
        const modules = dependencies.map(dep => {
            if (dep === 'N/ui/serverWidget') return serverWidget;
            return {};
        });
        const result = factory(...modules);
        ConfigDrivenFormBuilder = result;
    };

    // Load the module
    require('../src/fs_config_driven_form_builder');
});

describe('ConfigDrivenFormBuilder', () => {
    let builder;

    beforeEach(() => {
        builder = new ConfigDrivenFormBuilder();
    });

    describe('buildForm', () => {
        it('should create form with correct title', () => {
            const columnConfig = [
                {
                    id: 'custpage_name',
                    label: 'Name',
                    type: serverWidget.FieldType.TEXT,
                    valueAccessor: 'name'
                }
            ];

            const form = builder.buildForm({
                title: 'Test Report',
                resultsData: [{ name: 'Test' }],
                columnConfig: columnConfig
            });

            expect(form.title).toBe('Test Report');
        });

        it('should create sublist with configured fields', () => {
            const columnConfig = [
                {
                    id: 'custpage_name',
                    label: 'Name',
                    type: serverWidget.FieldType.TEXT,
                    valueAccessor: 'name'
                },
                {
                    id: 'custpage_amount',
                    label: 'Amount',
                    type: serverWidget.FieldType.CURRENCY,
                    valueAccessor: 'amount'
                }
            ];

            const form = builder.buildForm({
                title: 'Test Report',
                resultsData: [],
                columnConfig: columnConfig
            });

            const sublist = form.getSublist('custpage_results');
            expect(sublist).not.toBeNull();
            expect(sublist.fields.length).toBe(2);
            expect(sublist.fields[0].id).toBe('custpage_name');
            expect(sublist.fields[1].id).toBe('custpage_amount');
        });

        it('should populate sublist with data using string accessor', () => {
            const columnConfig = [
                {
                    id: 'custpage_name',
                    label: 'Name',
                    type: serverWidget.FieldType.TEXT,
                    valueAccessor: 'name'
                }
            ];

            const resultsData = [
                { name: 'Alice' },
                { name: 'Bob' }
            ];

            const form = builder.buildForm({
                title: 'Test Report',
                resultsData: resultsData,
                columnConfig: columnConfig
            });

            const sublist = form.getSublist('custpage_results');
            expect(sublist.lines[0].custpage_name).toBe('Alice');
            expect(sublist.lines[1].custpage_name).toBe('Bob');
        });

        it('should populate sublist with data using function accessor', () => {
            const columnConfig = [
                {
                    id: 'custpage_fullname',
                    label: 'Full Name',
                    type: serverWidget.FieldType.TEXT,
                    valueAccessor: (result) => result.first + ' ' + result.last
                }
            ];

            const resultsData = [
                { first: 'John', last: 'Doe' }
            ];

            const form = builder.buildForm({
                title: 'Test Report',
                resultsData: resultsData,
                columnConfig: columnConfig
            });

            const sublist = form.getSublist('custpage_results');
            expect(sublist.lines[0].custpage_fullname).toBe('John Doe');
        });

        it('should handle currency formatting', () => {
            const columnConfig = [
                {
                    id: 'custpage_amount',
                    label: 'Amount',
                    type: serverWidget.FieldType.CURRENCY,
                    valueAccessor: 'amount'
                }
            ];

            const resultsData = [
                { amount: 1234.5 }
            ];

            const form = builder.buildForm({
                title: 'Test Report',
                resultsData: resultsData,
                columnConfig: columnConfig
            });

            const sublist = form.getSublist('custpage_results');
            // Currency should be formatted to 2 decimal places
            expect(sublist.lines[0].custpage_amount).toBe('1234.50');
        });

        it('should handle percent formatting', () => {
            const columnConfig = [
                {
                    id: 'custpage_growth',
                    label: 'Growth',
                    type: serverWidget.FieldType.PERCENT,
                    valueAccessor: 'growth'
                }
            ];

            const resultsData = [
                { growth: 15.567 }
            ];

            const form = builder.buildForm({
                title: 'Test Report',
                resultsData: resultsData,
                columnConfig: columnConfig
            });

            const sublist = form.getSublist('custpage_results');
            // Percent should be formatted to 2 decimal places
            expect(sublist.lines[0].custpage_growth).toBe('15.57');
        });

        it('should handle null/undefined values safely', () => {
            const columnConfig = [
                {
                    id: 'custpage_value',
                    label: 'Value',
                    type: serverWidget.FieldType.TEXT,
                    valueAccessor: 'value'
                }
            ];

            const resultsData = [
                { value: null },
                { value: undefined },
                { value: '' }
            ];

            const form = builder.buildForm({
                title: 'Test Report',
                resultsData: resultsData,
                columnConfig: columnConfig
            });

            const sublist = form.getSublist('custpage_results');
            // Should use fallback value (single space) for null/undefined/empty
            expect(sublist.lines[0].custpage_value).toBe(' ');
            expect(sublist.lines[1].custpage_value).toBe(' ');
            expect(sublist.lines[2].custpage_value).toBe(' ');
        });

        it('should skip checkbox fields when populating data', () => {
            const columnConfig = [
                {
                    id: 'custpage_select',
                    label: 'Select',
                    type: serverWidget.FieldType.CHECKBOX,
                    valueAccessor: null
                },
                {
                    id: 'custpage_name',
                    label: 'Name',
                    type: serverWidget.FieldType.TEXT,
                    valueAccessor: 'name'
                }
            ];

            const resultsData = [
                { name: 'Test' }
            ];

            const form = builder.buildForm({
                title: 'Test Report',
                resultsData: resultsData,
                columnConfig: columnConfig
            });

            const sublist = form.getSublist('custpage_results');
            // Checkbox field should not have a value set
            expect(sublist.lines[0].custpage_select).toBeUndefined();
            // Text field should have value
            expect(sublist.lines[0].custpage_name).toBe('Test');
        });

        it('should attach client script if path provided', () => {
            const columnConfig = [
                {
                    id: 'custpage_name',
                    label: 'Name',
                    type: serverWidget.FieldType.TEXT,
                    valueAccessor: 'name'
                }
            ];

            const form = builder.buildForm({
                title: 'Test Report',
                resultsData: [],
                columnConfig: columnConfig,
                clientScriptPath: './test_client_script.js'
            });

            expect(form.clientScriptModulePath).toBe('./test_client_script.js');
        });

        it('should handle nested property paths', () => {
            const columnConfig = [
                {
                    id: 'custpage_email',
                    label: 'Email',
                    type: serverWidget.FieldType.TEXT,
                    valueAccessor: 'contact.email'
                }
            ];

            const resultsData = [
                { contact: { email: 'test@example.com' } }
            ];

            const form = builder.buildForm({
                title: 'Test Report',
                resultsData: resultsData,
                columnConfig: columnConfig
            });

            const sublist = form.getSublist('custpage_results');
            expect(sublist.lines[0].custpage_email).toBe('test@example.com');
        });
    });
});
