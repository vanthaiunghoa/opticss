import * as parse5 from "parse5";
import { assert } from "chai";

import { TemplateAnalysis } from "../../src/TemplateAnalysis";
import { OptiCSSOptions, TemplateIntegrationOptions } from "../../src/OpticssOptions";
import { OptimizationResult, Optimizer } from "../../src/Optimizer";

import { Cascade, walkElements, allElements, parseHtml, debugElement, bodyElement, serializeElement, assertSameCascade, AssertionResult } from "resolve-cascade";
import { SimpleTemplateRunner } from "./SimpleTemplateRunner";
import { SimpleAnalyzer } from "./SimpleAnalyzer";
import { TestTemplate } from "./TestTemplate";
import { SimpleTemplateRewriter } from "./SimpleTemplateRewriter";
import { inspect } from "util";

export interface TestedMarkup {
  originalBody: string;
  optimizedBody: string;
}

export interface CascadeAssertionResults {
  template: TestTemplate;
  assertionResults: Array<AssertionResult>;
}

export interface CascadeTestResult {
  optimization: OptimizationResult;
  testedTemplates: CascadeAssertionResults[];
}

export interface CascadeTestErrorDetails {
  optimization: OptimizationResult;
  template: TestTemplate;
  rewrittenHtml: string;
}

export type CascadeTestError = Error & CascadeTestErrorDetails;

export function testOptimizationCascade(
  options: Partial<OptiCSSOptions>,
  templateOptions: TemplateIntegrationOptions,
  ...stylesAndTemplates: Array<string | TestTemplate>
): Promise<CascadeTestResult> {
  let optimizer = new Optimizer(options, templateOptions);
  let nCss = 1;
  let originalCss = "";
  let analysisPromises = new Array<Promise<TemplateAnalysis<"TestTemplate">>>();
  let templates = new Array<TestTemplate>();
  stylesAndTemplates.forEach(styleOrTemplate => {
    if (typeof styleOrTemplate === "string") {
      originalCss += (originalCss.length > 0 ? "\n" : "") + styleOrTemplate;
      optimizer.addSource({ content: styleOrTemplate, filename: `test${nCss++}.css` });
    } else {
      let analyzer = new SimpleAnalyzer(styleOrTemplate);
      analysisPromises.push(analyzer.analyze());
      templates.push(styleOrTemplate);
    }
  });
  return Promise.all(analysisPromises).then(analyses => {
    analyses.forEach(a => {
      optimizer.addAnalysis(a);
    });
  }).then(() => {
    return optimizer.optimize("optimized.css").then(optimization => {
      let rewriter = new SimpleTemplateRewriter(optimization.styleMapping);
      let allTemplateRuns = new Array<Promise<CascadeAssertionResults>>();
      templates.forEach(template => {
        let runner = new SimpleTemplateRunner(template);
        let promise = runner.runAll().then(result => {
          let cascadeAssertions = new Array<Promise<AssertionResult>>();
          result.forEach((html) => {
            let rewrittenHtml = rewriter.rewrite(template, html);
            cascadeAssertions.push(
              assertSameCascade(originalCss,
                                optimizationToCss(optimization),
                                html,
                                rewrittenHtml).catch((e: any) => {
                                  Object.assign(e, {
                                    optimization,
                                    template,
                                    rewrittenHtml
                                  });
                                  throw e;
                                }));
          });
          return Promise.all(cascadeAssertions).then(assertionResults => {
            return {template, assertionResults};
          });
        });
        allTemplateRuns.push(promise);
      });
      return Promise.all(allTemplateRuns).then((testedTemplates) => {
        return {
          optimization,
          testedTemplates
        };
      });
    });
  });

}

function optimizationToCss(opt: OptimizationResult): string {
  let content = opt.output.content;
  if (typeof content === "string") {
    return content;
  } else {
    return content.css;
  }
}

export function logOptimizations(optimization: OptimizationResult) {
  optimization.actions.performed.forEach(a => {
    console.log(a.logString());
  });
}

export function debugResult(inputCSS: string, result: CascadeTestResult) {
  const optimized = result.optimization.output.content.toString();
  logOptimizations(result.optimization);
  console.log("Input CSS:", "\n" + indentString(inputCSS));
  console.log("Optimized CSS:", "\n" + indentString(optimized));
  result.testedTemplates.forEach(testedTemplate => {
    console.log("Template:", "\n" + indentString(testedTemplate.template.contents));
    testedTemplate.assertionResults.forEach(results => {
      console.log("Rewritten to:", "\n" + indentString(serializeElement(bodyElement(results.actualDoc)!)));
    });
  });
}

export function debugError(inputCSS: string, error: CascadeTestError) {
  console.error(error);
  console.log("Input CSS:", "\n" + indentString(inputCSS));
  console.log("==============================================================");
  if (error.optimization) {
    console.log(error.optimization.actions.performed.map(a => a.logString()).join("\n"));
    console.log("==============================================================");
    console.log("Optimized CSS:", "\n" + indentString(error.optimization.output.content.toString()));
    console.log("==============================================================");
  } else {
    console.log("No optimization occurred before error was raised.");
  }
  if (error.template) {
    console.log("Template:", "\n" + indentString(error.template.contents));
    console.log("==============================================================");
  }
  if (error.rewrittenHtml) {
    console.log("Template Rewrite:", "\n" + indentString(error.rewrittenHtml));
    console.log("==============================================================");
  }
}

function indentString(str: string, indent = "  ") {
 return indent + str.split("\n").join("\n" + indent);
}