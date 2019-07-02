import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import _ from 'lodash';
import handlebars from 'handlebars';
import { verify } from './verify';
import templateDatasFromSpecs from './templateDatasFromSpecs';

// Parse the api specs, render our templates, and write the output files.
// Also functions as the programmatic interface for small-swagger-codegen.
export function render(language, apis, options, output) {
  const templateDatas = templateDatasFromSpecs(apis, language, options);
  verify(templateDatas);

  language.configureHandlebars(handlebars);

  const templateSpecs = language.templates;
  const compiledTemplates = templateSpecs.map(({ source }) => {
    if (typeof source === 'function') {
      return source;
    }
    return handlebars.compile(fs.readFileSync(source, 'utf8'));
  });

  templateSpecs.forEach(({ partial }, index) => {
    if (partial) {
      handlebars.registerPartial(partial, compiledTemplates[index]);
    }
  });

  const outputs = _.map(templateDatas, (templateData, apiName) => {
    const specConfig = apis[apiName].spec;
    const apiVersion = options?.version || specConfig.info.version;

    return templateSpecs
      .map(({ filename, partial }, index) => {
        if (partial) {
          return null;
        }

        const templateArgs = {
          ...templateData,
          options,
          apiClassName: apis[apiName].className || apis[apiName].name,
          apiName,
          apiVersion,
          spec: specConfig,
        };
        const rendered = compiledTemplates[index](templateArgs);
        return [filename(templateArgs), rendered];
      })
      .filter(_.identity);
  });
  const parts = _.fromPairs(_.flatten(outputs));

  if (output) {
    Object.entries(parts).forEach(([filename, content]) => {
      const fullPath = path.join(output, filename);
      mkdirp.sync(path.dirname(fullPath));
      fs.writeFileSync(fullPath, content);
    });
  }

  return parts;
}
