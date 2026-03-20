/**
 * Mock for N/ui/serverWidget module
 */

class Field {
  constructor(config) {
    this.id = config.id;
    this.label = config.label;
    this.type = config.type;
    this.source = config.source || null;
    this.container = config.container || null;
    this.defaultValue = null;
    this.displayType = null;
    this.isMandatory = false;
    this.maxLength = null;
    this.helpText = null;
  }

  updateDisplayType(config) {
    this.displayType = config.displayType;
    return this;
  }

  updateBreakType(config) {
    this.breakType = config.breakType;
    return this;
  }

  setHelpText(config) {
    this.helpText = config.help || config;
    return this;
  }

  addSelectOption(config) {
    if (!this.selectOptions) this.selectOptions = [];
    this.selectOptions.push({ value: config.value, text: config.text });
    return this;
  }
}

class Sublist {
  constructor(config) {
    this.id = config.id;
    this.label = config.label;
    this.type = config.type;
    this.fields = [];
    this.lines = [];
  }

  addField(config) {
    const field = new Field(config);
    this.fields.push(field);
    return field;
  }

  setSublistValue(config) {
    const { id, line, value } = config;

    // Ensure lines array is large enough
    while (this.lines.length <= line) {
      this.lines.push({});
    }

    // Set the value
    this.lines[line][id] = value;
  }

  getSublistValue(config) {
    const { id, line } = config;
    if (line >= this.lines.length) return null;
    return this.lines[line][id] || null;
  }
}

class Button {
  constructor(config) {
    this.id = config.id;
    this.label = config.label;
    this.functionName = config.functionName || null;
  }
}

class Form {
  constructor(config) {
    this.title = config.title;
    this.hideNavBar = config.hideNavBar !== false;
    this.fields = [];
    this.sublists = [];
    this.buttons = [];
    this.messages = [];
    this.fieldGroups = [];
    this.clientScriptModulePath = null;
  }

  addField(config) {
    const field = new Field(config);
    this.fields.push(field);
    return field;
  }

  addSublist(config) {
    const sublist = new Sublist(config);
    this.sublists.push(sublist);
    return sublist;
  }

  addButton(config) {
    const button = new Button(config);
    this.buttons.push(button);
    return button;
  }

  addSubmitButton(config) {
    const button = new Button({
      id: 'custpage_submit',
      label: config.label || 'Submit'
    });
    this.buttons.push(button);
    return button;
  }

  addResetButton(config) {
    const button = new Button({
      id: 'custpage_reset',
      label: config.label || 'Reset'
    });
    this.buttons.push(button);
    return button;
  }

  addPageInitMessage(config) {
    this.messages.push({
      type: config.type,
      title: config.title,
      message: config.message,
      duration: config.duration || null
    });
  }

  addFieldGroup(config) {
    this.fieldGroups.push({
      id: config.id,
      label: config.label
    });
    return this;
  }

  getField(config) {
    const id = config.id || config;
    return this.fields.find(f => f.id === id) || null;
  }

  getSublist(config) {
    const id = config.id || config;
    return this.sublists.find(s => s.id === id) || null;
  }

  updateDefaultValues(values) {
    Object.keys(values).forEach(fieldId => {
      const field = this.getField(fieldId);
      if (field) {
        field.defaultValue = values[fieldId];
      }
    });
  }
}

function createForm(config) {
  return new Form(config);
}

const FieldType = {
  TEXT: 'text',
  EMAIL: 'email',
  PHONE: 'phone',
  DATE: 'date',
  DATETIME: 'datetime',
  CHECKBOX: 'checkbox',
  SELECT: 'select',
  MULTISELECT: 'multiselect',
  TEXTAREA: 'textarea',
  RICHTEXT: 'richtext',
  INTEGER: 'integer',
  FLOAT: 'float',
  CURRENCY: 'currency',
  PERCENT: 'percent',
  URL: 'url',
  INLINEHTML: 'inlinehtml',
  LABEL: 'label',
  LONGTEXT: 'longtext',
  RADIO: 'radio',
  IMAGE: 'image',
  FILE: 'file'
};

const FieldDisplayType = {
  NORMAL: 'normal',
  ENTRY: 'entry',
  INLINE: 'inline',
  DISABLED: 'disabled',
  READONLY: 'readonly',
  HIDDEN: 'hidden'
};

const SublistType = {
  LIST: 'list',
  INLINEEDITOR: 'inlineeditor',
  STATICLIST: 'staticlist',
  EDITOR: 'editor'
};

const FieldBreakType = {
  NONE: 'none',
  STARTCOL: 'startcol',
  STARTROW: 'startrow'
};

const MessageType = {
  CONFIRMATION: 'confirmation',
  INFORMATION: 'information',
  WARNING: 'warning',
  ERROR: 'error'
};

module.exports = {
  createForm,
  FieldType,
  FieldDisplayType,
  SublistType,
  FieldBreakType,
  MessageType,
  Form,
  Field,
  Sublist,
  Button
};
