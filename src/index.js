import fs from 'fs';
import _ from 'lodash';
import assert from 'assert';
import handlebars from 'handlebars';
import urlJoin from 'url-join';
import { describe, log, verify } from './verify';

const config = require('../config.json');
const HTTP_METHODS = [
  'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'
];

//////////////////////////////////////////////////////////////////////
// Helpers
//////////////////////////////////////////////////////////////////////

// Given an object and a key name, return a clone of the object where any fields matching the name
//   are removed deeply.
// For example:
//   deepOmit({ a: 1, b: 2, c: [ { a: 42 } ] }, 'a')
// Results in this (all the 'a' have been omitted):
//   { b: 2, c: [ { } ] }
function deepOmit(obj, keyName) {
  if (Array.isArray(obj)) {
    return obj.map(o => deepOmit(o, keyName));
  } else if (obj instanceof Object) {
    return _.chain(obj)
      .pickBy((value, key) => key !== keyName)
      .mapValues(o => deepOmit(o, keyName))
      .value();
  }
  return obj;
}

// Merge all the argument objects together. If any of the objects have properties with the
//   same name where the values are arrays, then combine those arrays in the output.
// For example:
//   deepMerge({ a: [1, 2], b: 1 }, { a: [3], b: 2 })
// The result would be:
//   { a: [1, 2, 3], b: 2 }
function deepMerge(...objs) {
  return _.mergeWith({}, ...objs, (objValue, srcValue) => {
    if (_.isArray(objValue)) {
      return objValue.concat(srcValue);
    }
    return undefined;
  });
}

// Deeply omit any fields named 'description' from the arguments and check if the results are equal.
// Useful to compare swagger schemas since we generally care whether the 'real stuff' (types, formats, etc.)
// are equal, and not whether the descriptions (i.e. comments) are equal.
function isEqualIgnoringDescription(a, b) {
  return _.isEqual(
    deepOmit(a, 'description'),
    deepOmit(b, 'description')
  );
}

function lastRefComponent(ref) {
  if (!ref) { return ref; }
  return _.split(ref, '/').pop();
}

function typeFromRef(ref) {
  return classNameFromComponents(lastRefComponent(ref));
}

function nameFromComponents(...components) {
  const name = _.camelCase(components.join('/'));
  if (!isNaN(name[0])) {
    return `_${name}`;
  }
  return name;
}

function classNameFromComponents(...components) {
  return _.upperFirst(nameFromComponents(...components));
}

function mapPrimitiveType(type) {
  if (type === 'string') {
    return 'String';
  } else if (type === 'boolean') {
    return 'Bool';
  } else if (type === 'number') {
    return 'Double';
  } else if (type === 'file') {
    return 'URL';
  } else if (type === 'object') {
    return 'Dictionary<String, Any>';
  }
  return undefined;
}

function mapPrimitiveValue(value, type) {
  return type === 'string' ? `"${value}"` : value;
}


//////////////////////////////////////////////////////////////////////
// Resolving $ref and allOf
//////////////////////////////////////////////////////////////////////

// Given a $ref string and an object, return the value that the reference points to
//   in refTarget.
// For example: resolveRef('#/definitions/Something', { definitions: { Something: 42 } }) => 42
function resolveRef(ref, refTarget) {
  assert(ref.substring(0, 2) === '#/', `No support for refs that don't start with '#/': ${ref}`);
  return _.get(refTarget, ref.substring(2).split('/'));
}

function objectByResolving(args) {
  const { obj, refTarget, shouldResolveRef, shouldResolveAllOf, ignoreRef } = args;
  const { $ref: ref, allOf } = obj;
  const needsRefResolution = shouldResolveRef && ref;
  const needsAllOfResolution = shouldResolveAllOf && allOf;
  // Omit any fields that we're about to resolve
  const filtered = _.omit(obj, [shouldResolveRef && '$ref', shouldResolveAllOf && 'allOf']);
  // If this obj doesn't have any of the things we're trying to resolve, then we don't have to do
  //   anything.
  if (!needsRefResolution && !needsAllOfResolution) {
    return filtered;
  }
  // If we have a ref, get the object referenced by it
  const objFromRef = needsRefResolution && ref !== ignoreRef && resolveRef(ref, refTarget);
  // If we have an allOf, get an array of the resolved version of each object in the allOf.
  // We always have to resolve the $refs of any objects in the allOf, or else when we merge
  //   the objects together, if there are multiple objects with a $ref, all but one $ref will be
  //   overwritten.
  const objsFromAllOf = _.flatMap(needsAllOfResolution && allOf, item => (
    objectByResolving({ ...args, obj: item, shouldResolveRef: true })
  ));
  // Merge this object and all the objects from its ref and/or allOf together.
  const resolved = deepMerge(objFromRef, ...objsFromAllOf, filtered);
  // Ensure we don't return an object containing anything we're trying to resolve by recursing.
  return objectByResolving({ ...args, obj: resolved });
}

function objectByResolvingRef(obj, refTarget, opts) {
  return objectByResolving({
    obj, refTarget, ...opts, shouldResolveRef: true
  });
}

function objectByResolvingRefAndAllOf(obj, refTarget, opts) {
  return objectByResolving({
    obj, refTarget, ...opts, shouldResolveRef: true, shouldResolveAllOf: true
  });
}


//////////////////////////////////////////////////////////////////////
// Models
//////////////////////////////////////////////////////////////////////
function typeInfoAndModelsFromObjectSchema(schema, name, specName, unresolvedSuperclassSchema, refTarget) {
  const superclassRef = _.get(unresolvedSuperclassSchema, '$ref');
  const superclass = typeFromRef(superclassRef);

  const propertyTypeInfoAndModels = _.mapValues(schema.properties, (property, propertyName) => (
    typeInfoAndModelsFromSchema(property, classNameFromComponents(name, propertyName), refTarget)
  ));

  const propertyModels = _.flatMap(propertyTypeInfoAndModels, ({ models }) => models);

  const properties = _.map(propertyTypeInfoAndModels, ({ typeInfo }, propertyName) => ({
    name: nameFromComponents(propertyName),
    description: schema.properties[propertyName].description,
    type: typeInfo.name,
    format: typeInfo.format,
    isRequired: !!_.find(schema.required, r => r === propertyName),
    specName: propertyName
  }));

  const { models: superclassModels } = superclass && typeInfoAndModelsFromSchema(
    unresolvedSuperclassSchema, undefined, refTarget
  );
  const superModel = _.get(superclassModels, '[0]');
  // This model's inherited properties are all the non-inherited properties of its superclass
  //   plus all the inherited properties of its superclass.
  const inheritedProperties = _.get(
    superModel, 'properties', []
  ).concat(_.get(
    superModel, 'inheritedProperties', []
  ));

  // If this model has any properties with the same name and type as one of its inherited
  //   properties, then remove the non-inherited property and use the inherited one.
  const nonInheritedProperties = _.filter(properties, prop => {
    const matching = _.find(inheritedProperties, iProp => isEqualIgnoringDescription(prop, iProp));
    return !matching;
  });

  const myModel = {
    name, specName, superclass, ..._.pick(schema, 'discriminator', 'description', 'type'),
    properties: nonInheritedProperties,
    inheritedProperties: [...inheritedProperties],
    initializerProperties: [...nonInheritedProperties, ...inheritedProperties],
  };

  return { typeInfo: { name }, models: _.concat(myModel, propertyModels, superclassModels) };
}

function typeInfoAndModelsFromSchema(unresolvedSchema, defaultName, refTarget) {
  const ref = unresolvedSchema.$ref;
  const name = ref ? typeFromRef(ref) : defaultName;
  const specName = ref ? lastRefComponent(ref) : defaultName;

  const refResolvedSchema = objectByResolvingRef(unresolvedSchema, refTarget);
  const unresolvedSuperclassSchema = _.find(refResolvedSchema.allOf, item => item.$ref);
  const superclassRef = _.get(unresolvedSuperclassSchema, '$ref');
  const schema = objectByResolvingRefAndAllOf(
    unresolvedSchema, refTarget, { ignoreRef: superclassRef }
  );

  if (schema.enum) {
    const model = {
      name, type: 'enum',
      enumType: mapPrimitiveType(schema.type),
      values: _.map(schema.enum, e => ({
        name: nameFromComponents(e),
        value: mapPrimitiveValue(e, schema.type)
      }))
    };
    return { typeInfo: { name }, models: [model] };

  } else if (schema.type === 'array') {
    const { typeInfo: itemTypeInfo, models: itemModels } = typeInfoAndModelsFromSchema(
      schema.items, name, refTarget
    );
    const typeName = `Array<${itemTypeInfo.name}>`;
    return { typeInfo: { name: typeName, format: itemTypeInfo.format }, models: itemModels };

  } else if (schema.type === 'string') {
    if (schema.format === 'date' || schema.format ==='date-time') {
      return { typeInfo: { name: 'Date', format: schema.format }, models: [] };
    } else {
      return { typeInfo: { name: 'String' }, models: [] };
    }

  } else if (schema.type === 'object' && schema.properties) {
    return typeInfoAndModelsFromObjectSchema(
      schema, name, specName, unresolvedSuperclassSchema, refTarget
    );

  } else if (schema.type === 'integer') {
    const typeName = schema.format === 'int64' ? 'Int64' : 'Int32';
    return { typeInfo: { name: typeName }, models: [] };

  } else if (mapPrimitiveType(schema.type)) {
    return { typeInfo: { name: mapPrimitiveType(schema.type) }, models: []};

  } else if (!schema.type) {
    return { typeInfo: { name: 'Void' }, models: []};
  }

  assert(false, `I don't know how to process a schema of type ${schema.type} 🤔\n  ${describe(schema)}`);
}

function typeInfoAndModelsFromParam(param, methodName, refTarget) {
  const defaultName = classNameFromComponents(methodName, param.name || 'response');
  return typeInfoAndModelsFromSchema(param.schema, defaultName, refTarget);
}


//////////////////////////////////////////////////////////////////////
// Methods
//////////////////////////////////////////////////////////////////////
function paramAndModelsFromSpec(paramSpec, name, refTarget) {
  paramSpec = objectByResolvingRefAndAllOf(paramSpec, refTarget);
  // Sometimes params have a schema, sometimes they just have the properties
  //   that a schema would normally have. This normalizes all params to be
  //   objects that have a schema.
  if (!paramSpec.schema) {
    const schema = paramSpec;
    paramSpec = {
      name: paramSpec.name,
      in: paramSpec.in,
      description: paramSpec.description,
      required: paramSpec.required,
      schema,
    };
  }
  const ret = objectByResolvingRefAndAllOf(paramSpec, refTarget);
  const { typeInfo: responseTypeInfo, models: responseModels } = typeInfoAndModelsFromParam(
    ret, name, refTarget
  );
  ret.type = responseTypeInfo.name || ret.type || 'Void';
  ret.format = responseTypeInfo.format;
  if (ret.name) {
    ret.serverName = ret.name;
    ret.name = _.camelCase(ret.name);
  }
  return { param: ret, models: responseModels };
}

function methodFromSpec(path, pathParams, basePath, method, methodSpec, refTarget) {
  if (!methodSpec) {
    return undefined;
  }

  const name = _.camelCase(methodSpec.operationId || urlJoin(path, method));
  const description = methodSpec.description;

  const paramSpecs = _.concat(pathParams || [], methodSpec.parameters || []);
  const mappedParams = _.map(paramSpecs, paramSpec => paramAndModelsFromSpec(paramSpec, name, refTarget));
  const paramModels = _.flatten(_.map(mappedParams, paramAndModels => paramAndModels.models));
  const params = _.map(mappedParams, paramAndModels => paramAndModels.param);

  const goodResponseKey = _.find(Object.keys(methodSpec.responses), k => k[0] === '2') || 'default';
  const responseSpec = methodSpec.responses[goodResponseKey];
  const { param: response, models: responseModels } = paramAndModelsFromSpec(responseSpec, name, refTarget);

  const models = paramModels.concat(responseModels);
  return { path: urlJoin('/', basePath, path), name, description, method, params, response, models };
}

function methodsFromPath(path, pathSpec, basePath, refTarget) {
  return _.flatMap(HTTP_METHODS, method => methodFromSpec(
    path,
    pathSpec.parameters,
    basePath,
    method,
    pathSpec[method],
    refTarget
  ));
}

function methodsFromPaths(paths, basePath, refTarget) {
  return _(paths)
    .flatMap((pathSpec, path) => {
      return methodsFromPath(path, pathSpec, basePath, refTarget);
    })
    .filter()
    .sortBy('path')
    .value();
}


//////////////////////////////////////////////////////////////////////
// Process Specs
//////////////////////////////////////////////////////////////////////

function moveModelsOffMethods(methodsWithModels) {
  const rawModels = _.flatMap(methodsWithModels, method => method.models);
  const combinedModels = _.uniqWith(_.filter(rawModels), isEqualIgnoringDescription);
  const methods = _.map(methodsWithModels, method => _.omit(method, 'models'));
  return { combinedModels, methods };
}

function splitModels(combinedModels) {
  return _.reduce(combinedModels, (acc, model) => {
    const type = model.type;
    assert(type === 'object' || type === 'enum', `Found non-object-or-enum model: ${describe(model)}`);
    acc[type === 'object' ? 'objectModels' : 'enumModels'].push(model);
    return acc;
  }, { objectModels: [], enumModels: [] });
}

// For any model that is the superclass of another model, find all of that model's subclasses
//   and put some information about those subclasses on the superclass model.
function resolveSubclasses(objectModelsWithoutResolvedSubclasses) {
  const om = objectModelsWithoutResolvedSubclasses;
  return _.map(om, model => {
    const subclasses = _.filter(_.map(om, subModel => {
      if (subModel.superclass !== model.name) { return undefined; }
      return _.pick(subModel, ['specName', 'name']);
    }));
    return { ...model, subclasses };
  });
}

function templateDataFromSpec(spec, apiName) {
  const basePath = urlJoin(config.specs[apiName].basePath, spec.basePath || '');
  const methodsWithModels = methodsFromPaths(spec.paths, basePath, spec);
  const { combinedModels, methods } = moveModelsOffMethods(methodsWithModels);
  const { objectModels, enumModels } = splitModels(combinedModels);
  return { methods, objectModels: resolveSubclasses(objectModels), enumModels, apiName };
}

function templateDatasFromSpecs(specs) {
  return _.mapValues(specs, (spec, apiName) => templateDataFromSpec(spec, apiName));
}


//////////////////////////////////////////////////////////////////////
// Script
//////////////////////////////////////////////////////////////////////

const specs = _.mapValues(config.specs, c => require(c.spec));
const templateDatas = templateDatasFromSpecs(specs);
verify(templateDatas);

handlebars.registerHelper('maybeComment', function(arg, options) {
  if (!arg) { return arg; }
  const data = options.data ? undefined : { data: handlebars.createFrame(options.data) };
  const string = options.fn ? options.fn(this, data) : '';
  if (!string || string.trim() === '') {
    return undefined;
  }
  const trimmed = string.trim().replace(/\n/g, ' ');
  const numSpaces = string.search(/\S/);
  return `${' '.repeat(numSpaces)}/// ${trimmed}\n`;
});

const template = handlebars.compile(fs.readFileSync('src/template.handlebars', 'utf8'));
const podtemplate = handlebars.compile(fs.readFileSync('src/podtemplate.handlebars', 'utf8'));
_.forEach(templateDatas, (templateData, apiName) => {
  const specConfig = config.specs[apiName];
  const apiVersion = require(`../node_modules/${specConfig.spec}/package.json`).version;

  templateData.apiClassName = specConfig.className;
  const rendered = template(templateData);
  fs.writeFileSync(`../gasbuddy-ios/DevelopmentPods/Generated/${apiName}.swift`, rendered);

  const renderedPodSpec = podtemplate({ apiName, apiVersion });
  fs.writeFileSync(`../gasbuddy-ios/DevelopmentPods/Generated/${apiName}.podspec`, renderedPodSpec);
});
