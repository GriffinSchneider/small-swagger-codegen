"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.describe = describe;
exports.log = log;
exports.verify = verify;

var _lodash = _interopRequireDefault(require("lodash"));

var _util = _interopRequireDefault(require("util"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function describe(it) {
  return _util.default.inspect(it, {
    depth: 10,
    colors: true,
    breakLength: 150
  });
}

function log(it) {
  console.log(`\n${describe(it)}`);
}

function findProblems(array, pred, foundProblem) {
  return array.filter(pred).map(item => foundProblem(describe(item))).join('');
}

function findAllProblems(array, ...problemFinders) {
  return _lodash.default.reduce(problemFinders, (acc, problemFinder) => acc + findProblems(array, problemFinder[0], problem => problem ? `${problemFinder[1](problem)}\n---------------------------` : ''), '');
}

function verifyMethods(methods) {
  return findAllProblems(methods, [method => _lodash.default.find([method.response].concat(method.params), param => !_lodash.default.get(param, 'type')), problem => `\nFound method with param or response without a type: ${problem}`], [method => _lodash.default.find(method.params, param => {
    if (param.in === 'formData' && param.schema && param.schema.type !== 'file') {
      return method;
    }

    return undefined;
  }), problem => `\nFound method with form data param that is not of type 'file': ${problem}`]);
}

function verifyModels(models) {
  const dupes = _lodash.default.filter(_lodash.default.map(models, model => {
    // Find any other models with the same name.
    const duplicates = _lodash.default.filter(models, otherModel => otherModel !== model && otherModel.name === model.name); // If we found any duplicates, add this model to the list.


    return duplicates.length > 0 ? model : undefined;
  }));

  return findAllProblems(models, [model => dupes.includes(model), problem => `\nFound model with duplicated name: ${problem}`], [model => !model.name, problem => `\nFound model without name: ${problem}`], [model => model.type !== 'object' && model.type !== 'enum', problem => `\nFound non-object-or-enum model: ${problem}`]);
}

function verifyTemplateData(data) {
  const problems = [].concat(verifyMethods(data.methods)).concat(verifyModels(data.objectModels)).concat(verifyModels(data.enumModels)).join('');
  return _lodash.default.isEmpty(problems) ? undefined : problems;
}

function verify(templateDatas) {
  const problems = _lodash.default.map(templateDatas, (templateData, apiName) => {
    const apiProblems = verifyTemplateData(templateData);
    return _lodash.default.isEmpty(apiProblems) ? '' : `Problems with ${apiName}: ${apiProblems}`;
  }).join('');

  if (!_lodash.default.isEmpty(problems)) {
    console.error(problems);
    process.exit(1);
  }
}