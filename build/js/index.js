"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _path = _interopRequireDefault(require("path"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _default = {
  templates: [{
    source: _path.default.resolve(__dirname, 'packageTemplate.handlebars'),
    filename: () => 'package.json'
  }, {
    source: _path.default.resolve(__dirname, 'babelTemplate.handlebars'),
    filename: () => 'babel.config.js'
  }, {
    source: _path.default.resolve(__dirname, 'indexTemplate.handlebars'),
    filename: () => 'index.js'
  }, {
    source: _path.default.resolve(__dirname, 'typingsTemplate.handlebars'),
    filename: () => 'index.d.ts'
  }, {
    source: _path.default.resolve(__dirname, 'modelClassTemplate.handlebars'),
    partial: 'modelClassTemplate'
  }, {
    source: ({
      spec
    }) => JSON.stringify(spec, null, '  '),
    filename: () => 'spec.json'
  }],
  typeMap: {
    any: 'any',
    undefined: 'void',
    boolean: 'boolean',
    number: 'number',
    file: 'string',
    object: additionalType => `Map<string, ${additionalType}>`,
    integer: 'number',
    string: {
      date: 'Date',
      'date-time': 'Date',
      default: 'string'
    },
    array: typeName => `Array<${typeName}>`
  },
  configureHandlebars: handlebars => {
    const jsIdentifier = ident => new handlebars.SafeString(ident.replace(/[.]/g, '_'));

    handlebars.registerHelper('jsIdentifier', jsIdentifier);
    handlebars.registerHelper('concat', (delim, ...args) => args.slice(0, args.length - 1).join(delim));
  }
};
exports.default = _default;