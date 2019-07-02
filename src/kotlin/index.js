import path from 'path';

export default {
  templates: [{
    source: path.resolve(__dirname, 'modelClassTemplate.handlebars'),
    partial: 'modelClassTemplate',
  }, {
    source: path.resolve(__dirname, 'template.handlebars'),
    filename({ apiClassName }) {
      return `${apiClassName}.kt`;
    },
  }],
  typeMap: {
    undefined: 'Response<Void>',
    boolean: 'Boolean',
    number: { int64: 'Int', int32: 'Int', default: 'Double' },
    file: 'MultipartBody.Part',
    object: additionalType => `Map<String, ${additionalType}>`,
    integer: 'Int',
    string: { date: 'OffsetDateTime', 'date-time': 'OffsetDateTime', default: 'String' },
    array: typeName => `List<${typeName}>`,
  },
  configureHandlebars: (handlebars) => {
    handlebars.registerHelper('oneline', function oneline(options) {
      return options.fn(this).trim().replace(/\n/g, ' ').trim();
    });
    handlebars.registerHelper('isNotBodyParam', function isNotBodyParam(arg, options) {
      if (!arg) {
        return arg;
      }
      if (arg.inCap !== 'Body') {
        return options.fn(this);
      }
      return options.inverse(this);
    });
  },
};
