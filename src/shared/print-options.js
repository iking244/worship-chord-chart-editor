const PAGE_SIZES = new Set(['A4', 'Letter']);

export function normalizePrintOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Print options must be an object.');
  }
  const supportedFields = new Set(['pageSize', 'orientation', 'fontSize', 'includeMetadata', 'key']);
  if (Object.keys(input).some((field) => !supportedFields.has(field))) {
    throw new TypeError('Print options contain an unsupported field.');
  }
  const {
    pageSize = 'A4',
    orientation = 'portrait',
    fontSize = 12,
    includeMetadata = true,
    key = ''
  } = input;
  if (!PAGE_SIZES.has(pageSize)) {
    throw new TypeError('Page size must be A4 or Letter.');
  }
  if (!['portrait', 'landscape'].includes(orientation)) {
    throw new TypeError('Orientation must be portrait or landscape.');
  }
  if (!Number.isInteger(fontSize) || fontSize < 8 || fontSize > 24) {
    throw new RangeError('Print font size must be an integer from 8 to 24 points.');
  }
  if (typeof includeMetadata !== 'boolean') {
    throw new TypeError('Include metadata must be a boolean.');
  }
  if (typeof key !== 'string' || key.length > 4) {
    throw new TypeError('Print key must be a key name of at most four characters.');
  }
  return { pageSize, orientation, fontSize, includeMetadata, key };
}
