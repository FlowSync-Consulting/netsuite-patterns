/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NScriptId customscript_fs_pdf_generator
 * @NScriptName FS PDF Generator
 * @description Generate PDF documents from NetSuite records using templates
 *
 * PATTERN: PDF Generation
 *
 * This suitelet demonstrates how to generate branded PDF documents:
 * 1. Load record data and normalize for template use
 * 2. Apply HTML templates with BFO-compatible formatting
 * 3. Generate PDF using N/render module
 * 4. Return PDF for download or email
 *
 * BENEFITS:
 * - Branded, professional PDF documents
 * - Reusable templates across record types
 * - Complex layouts (tables, totals, headers/footers)
 * - Integration with workflow and email
 *
 * EXAMPLE USE CASE:
 * Generate custom invoice PDFs with:
 * - Company branding and logo
 * - Grouped line items by category
 * - Subtotals and tax calculations
 * - Payment terms and footer text
 *
 * [See the full case study](https://flowsyncconsulting.com/portfolio/pdf-template-invoice-generation/)
 */
define([
    './lib/data_sources',
    './lib/line_item_grouper',
    'N/render',
    'N/file',
    'N/log',
    'N/runtime',
    'N/ui/serverWidget'
], (
    DataSources,
    LineItemGrouper,
    render,
    file,
    log,
    runtime,
    serverWidget
) => {

    const TEMPLATE_FOLDER_ID = 12345; // Configure in deployment parameters

    /**
     * Handle GET and POST requests
     * @param {Object} context
     * @param {ServerRequest} context.request
     * @param {ServerResponse} context.response
     */
    function onRequest(context) {
        try {
            const params = context.request.parameters;
            const recordType = params.recordtype;
            const recordId = params.recordid;
            const templateName = params.template || 'invoice_template.html';

            if (!recordType || !recordId) {
                showErrorPage(context, 'Missing required parameters: recordtype and recordid');
                return;
            }

            log.audit('PDF Generation Request', {
                recordType: recordType,
                recordId: recordId,
                template: templateName
            });

            // Load record data
            const recordData = DataSources.loadRecordData(recordType, recordId);

            // Group line items if applicable
            if (recordData.lineItems && recordData.lineItems.length > 0) {
                recordData.groupedLineItems = LineItemGrouper.groupByCategory(recordData.lineItems);
            }

            // Generate PDF
            const pdfFile = generatePDF(recordData, templateName);

            // Return PDF
            context.response.writeFile({
                file: pdfFile,
                isInline: false
            });

            log.audit('PDF Generated Successfully', {
                fileName: pdfFile.name,
                fileSize: pdfFile.size
            });

        } catch (e) {
            log.error('Error in onRequest', {
                name: e.name,
                message: e.message,
                stack: e.stack
            });

            showErrorPage(context, 'PDF generation failed: ' + e.message);
        }
    }

    /**
     * Generate PDF from record data and template
     * @param {Object} recordData - Normalized record data
     * @param {string} templateName - Template file name
     * @returns {file.File}
     */
    function generatePDF(recordData, templateName) {
        // Load template file
        const templateFile = loadTemplate(templateName);

        // Create PDF renderer
        const renderer = render.create();
        renderer.templateContent = templateFile.getContents();

        // Add data to template
        renderer.addCustomDataSource({
            format: render.DataSource.OBJECT,
            alias: 'record',
            data: recordData
        });

        // Render PDF
        const pdfFile = renderer.renderAsPdf();

        // Set file name
        const fileName = buildFileName(recordData);
        pdfFile.name = fileName;

        return pdfFile;
    }

    /**
     * Load template file from file cabinet
     * @param {string} templateName
     * @returns {file.File}
     */
    function loadTemplate(templateName) {
        try {
            // In production, search for template by name in configured folder
            // For this pattern, we use a relative path
            const templatePath = `./templates/${templateName}`;
            return file.load({ id: templatePath });
        } catch (e) {
            log.error('Template Load Error', {
                template: templateName,
                error: e.message
            });
            throw new Error(`Template not found: ${templateName}`);
        }
    }

    /**
     * Build PDF file name from record data
     * @param {Object} recordData
     * @returns {string}
     */
    function buildFileName(recordData) {
        const docType = recordData.type || 'Document';
        const docNumber = recordData.tranId || recordData.id;
        const timestamp = new Date().toISOString().split('T')[0];

        return `${docType}_${docNumber}_${timestamp}.pdf`;
    }

    /**
     * Show error page when PDF generation fails
     * @param {Object} context
     * @param {string} errorMessage
     */
    function showErrorPage(context, errorMessage) {
        const form = serverWidget.createForm({
            title: 'PDF Generation Error'
        });

        form.addPageInitMessage({
            type: serverWidget.MessageType.ERROR,
            title: 'PDF Generation Failed',
            message: errorMessage
        });

        const errorField = form.addField({
            id: 'custpage_error_details',
            type: serverWidget.FieldType.INLINEHTML,
            label: 'Error Details'
        });

        errorField.defaultValue = `
            <div style="padding: 20px; background-color: #fff3cd; border: 1px solid #ffc107; margin: 10px 0;">
                <h3>What happened?</h3>
                <p>${errorMessage}</p>
                <h3>What can I do?</h3>
                <ul>
                    <li>Verify the record ID and type are correct</li>
                    <li>Check that the template exists in the file cabinet</li>
                    <li>Review script logs for detailed error information</li>
                    <li>Contact your NetSuite administrator if the problem persists</li>
                </ul>
            </div>
        `;

        context.response.writePage(form);
    }

    return {
        onRequest: onRequest
    };
});
