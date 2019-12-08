"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _path = _interopRequireDefault(require("path"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _default = {
  templates: [{
    source: _path.default.resolve(__dirname, 'template.handlebars'),

    filename({
      apiName
    }) {
      return `${apiName}.swift`;
    }

  }, {
    source: _path.default.resolve(__dirname, 'podTemplate.handlebars'),

    filename({
      apiName
    }) {
      return `${apiName}.podspec`;
    }

  }, {
    source: _path.default.resolve(__dirname, 'modelClassTemplate.handlebars'),
    partial: 'modelClassTemplate'
  }],
  typeMap: {
    undefined: 'Void',
    boolean: 'Bool',
    number: {
      int64: 'Int64',
      int32: 'Int32',
      default: 'Double'
    },
    file: 'URL',
    object: additionalType => `Dictionary<String, ${additionalType}>`,
    integer: {
      int64: 'Int64',
      default: 'Int32'
    },
    string: {
      date: 'Date',
      'date-time': 'Date',
      default: 'String'
    },
    array: typeName => `Array<${typeName}>`
  },
  configureHandlebars: handlebars => {
    handlebars.registerHelper('maybeComment', function maybeComment(arg, options) {
      if (!arg) {
        return arg;
      }

      const data = options.data ? undefined : {
        data: handlebars.createFrame(options.data)
      };
      const string = options.fn ? options.fn(this, data) : '';

      if (!string || string.trim() === '') {
        return undefined;
      }

      const trimmed = string.trim().replace(/\n/g, ' ');
      const numSpaces = string.search(/\S/);
      return `${' '.repeat(numSpaces)}/// ${trimmed}\n`;
    });
  }
};
exports.default = _default;