/**
 * @NApiVersion 2.1
 * @NScriptType WorkflowActionScript
 * @NScriptId customscript_fs_email_sender
 * @NScriptName FS Email PDF Workflow Action
 * @description Generate PDF and email to customer - used in workflows
 *
 * PATTERN: PDF Email Workflow Action
 *
 * This workflow action script generates a PDF from the current record and emails it.
 * Use this in workflows to automatically send PDFs when records are created or updated.
 *
 * EXAMPLE USE CASE:
 * - Email invoice PDF to customer when invoice is created
 * - Send sales order confirmation PDF when SO is approved
 * - Send packing slip PDF when fulfillment is created
 */
define([
    './lib/data_sources',
    './lib/line_item_grouper',
    'N/render',
    'N/email',
    'N/record',
    'N/runtime',
    'N/log'
], (
    DataSources,
    LineItemGrouper,
    render,
    email,
    record,
    runtime,
    log
) => {

    /**
     * Workflow action entry point
     * @param {Object} context
     * @param {Record} context.newRecord - Current record
     * @param {Record} context.oldRecord - Previous record state
     * @param {number} context.workflowId - Workflow ID
     * @param {string} context.type - Trigger type
     */
    function onAction(context) {
        try {
            const currentRecord = context.newRecord;
            const recordType = currentRecord.type;
            const recordId = currentRecord.id;

            log.audit('Email PDF Workflow Action', {
                recordType: recordType,
                recordId: recordId,
                workflowId: context.workflowId
            });

            // Get script parameters
            const scriptParams = getScriptParameters();
            const templateName = scriptParams.template || 'invoice_template.html';
            const emailSubject = scriptParams.subject || 'Your Document from NetSuite';
            const emailBody = scriptParams.body || 'Please find your document attached.';

            // Load record data
            const recordData = DataSources.loadRecordData(recordType, recordId);

            // Group line items if applicable
            if (recordData.lineItems && recordData.lineItems.length > 0) {
                recordData.groupedLineItems = LineItemGrouper.groupByCategory(recordData.lineItems);
            }

            // Generate PDF
            const pdfFile = generatePDF(recordData, templateName);

            // Get recipient email
            const recipientEmail = getRecipientEmail(currentRecord);

            if (!recipientEmail) {
                log.error('Email Send Failed', 'No recipient email found on record');
                return;
            }

            // Send email with PDF attachment
            sendEmailWithPDF(recipientEmail, emailSubject, emailBody, pdfFile);

            log.audit('PDF Emailed Successfully', {
                recipient: recipientEmail,
                fileName: pdfFile.name
            });

        } catch (e) {
            log.error('Error in onAction', {
                name: e.name,
                message: e.message,
                stack: e.stack
            });
            // Don't throw - allow workflow to continue
        }
    }

    /**
     * Get script deployment parameters
     * @returns {Object}
     */
    function getScriptParameters() {
        const script = runtime.getCurrentScript();

        return {
            template: script.getParameter({ name: 'custscript_fs_pdf_template' }),
            subject: script.getParameter({ name: 'custscript_fs_email_subject' }),
            body: script.getParameter({ name: 'custscript_fs_email_body' }),
            senderId: script.getParameter({ name: 'custscript_fs_sender_id' }) || -5 // Default: no-reply
        };
    }

    /**
     * Generate PDF from record data and template
     * @param {Object} recordData
     * @param {string} templateName
     * @returns {file.File}
     */
    function generatePDF(recordData, templateName) {
        const templateFile = file.load({
            id: `./templates/${templateName}`
        });

        const renderer = render.create();
        renderer.templateContent = templateFile.getContents();

        renderer.addCustomDataSource({
            format: render.DataSource.OBJECT,
            alias: 'record',
            data: recordData
        });

        const pdfFile = renderer.renderAsPdf();
        pdfFile.name = buildFileName(recordData);

        return pdfFile;
    }

    /**
     * Build PDF file name
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
     * Get recipient email from record
     * @param {Record} currentRecord
     * @returns {string|null}
     */
    function getRecipientEmail(currentRecord) {
        try {
            // For transactions, get customer email
            if (currentRecord.type.indexOf('sales') >= 0 ||
                currentRecord.type.indexOf('invoice') >= 0 ||
                currentRecord.type.indexOf('order') >= 0) {

                const customerId = currentRecord.getValue('entity');
                if (customerId) {
                    const customerRecord = record.load({
                        type: record.Type.CUSTOMER,
                        id: customerId
                    });
                    return customerRecord.getValue('email');
                }
            }

            // For other records, check for direct email field
            const emailField = currentRecord.getValue('email');
            if (emailField) {
                return emailField;
            }

            return null;

        } catch (e) {
            log.error('Error Getting Recipient Email', e.message);
            return null;
        }
    }

    /**
     * Send email with PDF attachment
     * @param {string} recipientEmail
     * @param {string} subject
     * @param {string} body
     * @param {file.File} pdfFile
     */
    function sendEmailWithPDF(recipientEmail, subject, body, pdfFile) {
        const scriptParams = getScriptParameters();

        email.send({
            author: scriptParams.senderId,
            recipients: recipientEmail,
            subject: subject,
            body: body,
            attachments: [pdfFile],
            relatedRecords: {
                // This ensures the email appears in record communications
            }
        });
    }

    return {
        onAction: onAction
    };
});
