/**
 * Mock for N/format module
 */

function format(config) {
  const { value, type } = config;

  if (type === Type.DATE) {
    if (value instanceof Date) {
      return value.toLocaleDateString('en-US');
    }
    return String(value);
  }

  if (type === Type.CURRENCY) {
    const num = parseFloat(value);
    if (isNaN(num)) return '0.00';
    return num.toFixed(2);
  }

  if (type === Type.FLOAT) {
    const num = parseFloat(value);
    if (isNaN(num)) return '0.0';
    return String(num);
  }

  return String(value);
}

function parse(config) {
  const { value, type } = config;

  if (type === Type.DATE) {
    return new Date(value);
  }

  if (type === Type.CURRENCY || type === Type.FLOAT) {
    return parseFloat(value);
  }

  if (type === Type.INTEGER) {
    return parseInt(value, 10);
  }

  return value;
}

const Type = {
  DATE: 'date',
  DATETIME: 'datetime',
  TIME: 'time',
  CURRENCY: 'currency',
  FLOAT: 'float',
  INTEGER: 'integer',
  PERCENT: 'percent',
  EMAIL: 'email',
  PHONE: 'phone',
  TEXT: 'text'
};

module.exports = {
  format,
  parse,
  Type
};
