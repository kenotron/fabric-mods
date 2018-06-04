/**
 *  Copyright (c) 2016-present, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

const babylon = require('babylon');
const recast = require('recast');

function parseRaw(code) {
  return recast.parse(code, { parser: { parse } }).program.body;
}

function transform(file, api) {
  const parse = source => babylon.parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
  
  const j = api.jscodeshift;
  
  // Step 1: get rid of example-app-base import; replace with new imports
  // import { IDemoPageProps } from '../../demo/components/DemoPage.types';
  // import { DemoPage } from '../../demo/components/DemoPage';
  let source = j(recast.parse(file.source, { parser: { parse } }))
    .find(
        j.ImportDeclaration, 
        node => node.source.value == '@uifabric/example-app-base'
    )
    .remove()
    .insertAfter(j.importDeclaration(
        [j.importSpecifier(
            j.identifier('IDemoPageProps')
        )],
        j.literal('../../demo/components/DemoPage.types')
    ))
    .insertAfter(j.importDeclaration(
        [j.importSpecifier(
            j.identifier('DemoPage')
        )],
        j.literal('../../demo/components/DemoPage')
    ))
    .toSource();

  // Step 2: create the JSON based on the exported component:
  let ast = j(recast.parse(source, { parser: { parse } }));
  const exportDeclaration = ast.find(j.ExportNamedDeclaration);
  
  const component = ast.findJSXElements('ComponentPage');
  const componentOpening = component.at(0).get().value.openingElement;
//console.log(componentOpening.attributes);
  let props = {};

  componentOpening.attributes.forEach(attribute => {
    switch(attribute.name.name) {
      case 'title':
        props.title = attribute.value.value;
        break;

      case 'exampleCards':
        const examples = [];
        const cards = j(attribute.value.expression).findJSXElements('ExampleCard');

        cards.forEach(card => {
          const attrs = card.value.openingElement.attributes;
          
          const view = j(card.value.children).find(j.JSXOpeningElement).at(0).get().parentPath.value;

          const example = j.objectExpression([
            j.property('init', j.literal('title'), j.literal(attrs.find(attr => attr.name.name == 'title').value.value)),
            j.property('init', j.literal('code'), attrs.find(attr => attr.name.name == 'code').value),
            j.property('init', j.literal('view'), view)
          ]);

          examples.push(example);
        });

        props.examples = j.arrayExpression(examples);
        break;

      case 'propertiesTables':
        const pt = j(attribute.value.expression).find(j.JSXOpeningElement);
        
        if (pt.length > 0) {
          const attrs = pt.at(0).get().value.attributes;
          const sourcesAttr = attrs.find(attr => attr.name.name == 'sources');
          const sourcesArrayExpression = j(sourcesAttr).find(j.JSXExpressionContainer).at(0).get().value.expression;

          props.propertiesTablesSources = sourcesArrayExpression;
        } else {
          props.propertiesTablesSources = j.arrayExpression();
        }

        break;

      case 'overview':
        const overview = j(attribute.value.expression).find(j.JSXExpressionContainer);

        if (overview.length > 0) {
          props.overview = overview.at(0).get().value.expression;
        } else {
          props.overview = j.literal('');
        }
        
        break;

      case 'bestPractices':
        const bp = j(attribute.value.expression).find(j.JSXExpressionContainer);

        if (bp.length > 0) {
          props.bp = overview.at(0).get().value.expression;
        } else {
          props.bp = j.literal('');
        }
      
        break;

      case 'dos':
        const dos = j(attribute.value.expression).find(j.JSXExpressionContainer);

        if (dos.length > 0) {
          props.dos = dos.at(0).get().value.expression;
        } else {
          props.dos = j.literal('');
        }

        props.dos = j(attribute.value.expression).find(j.JSXExpressionContainer).at(0).get().value.expression;
        break;

      case 'donts':
        const donts = j(attribute.value.expression).find(j.JSXExpressionContainer);

        if (donts.length > 0) {
          props.donts = donts.at(0).get().value.expression;
        } else {
          props.donts = j.literal('');
        }

        props.donts = j(attribute.value.expression).find(j.JSXExpressionContainer).at(0).get().value.expression;
        break;
    }
  });

  const {statement} = j.template;

  const exportStatement = `export const ${props.title}PageProps: IDemoPageProps = {
  title: '${props.title}',
  componentName: '${props.title}',
  componentUrl: 'https://github.com/OfficeDev/office-ui-fabric-react/tree/master/packages/office-ui-fabric-react/src/components/${props.title}',
  componentStatus: ${props.title}Status,
  examples: ${j(props.examples).toSource()},
  propertiesTablesSources: ${j(props.propertiesTablesSources).toSource()},
  overview: ${j(props.overview).toSource()},
  bestPractices: ${j(props.bp).toSource()},
  dos: ${j(props.dos).toSource()},
  donts: ${j(props.donts).toSource()},
  isHeaderVisible: true,
};`;

  const replacement = recast.parse(exportStatement, { parser: { parse } }).program.body;

  source = exportDeclaration 
    .replaceWith(p => replacement)
    .insertAfter(
      j(`export const ${props.title}Page = (props: { isHeaderVisible: boolean }) => (<DemoPage { ...{ ...${props.title}PageProps, ...props } } />);`).toSource()
    )
    .toSource();

  return source;
}

module.exports = transform;