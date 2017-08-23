import { SingleFileOptimization } from "./Optimization";
import { StyleMapping } from "../StyleMapping";
import { ParsedCssFile } from "../CssFile";
import { OptiCSSOptions } from "../OpticssOptions";
import { TemplateAnalysis } from "../TemplateAnalysis";
import { TemplateTypes } from "../TemplateInfo";
import { Element, Match } from "../Styleable";
import { SelectorCache } from "../query";

export class RemoveUnusedStyles implements SingleFileOptimization {
  private options: OptiCSSOptions;
  constructor(options: OptiCSSOptions) {
    this.options = options;
  }
  optimizeSingleFile(_styleMapping: StyleMapping, file: ParsedCssFile,
    analyses: Array<TemplateAnalysis<keyof TemplateTypes>>, cache: SelectorCache): void
  {
    let elements = analyses.reduce((elements, analysis) => {
      elements.push(...analysis.elements);
      return elements;
    }, new Array<Element>());
    file.content.root!.walkRules((node) => {
      let parsedSelectors = cache.getParsedSelectors(node);
      let found = parsedSelectors.filter((value) => {
         return elements.find((element) => matches(element.matchSelector(value, false)));
      });
      if (found.length === 0) {
        node.remove();
      } else {
        if (found.length < parsedSelectors.length) {
          node.selector = parsedSelectors.join(", ");
          cache.reset(node);
        }
      }
    });
  }
}

function matches(m: Match): boolean {
  return m === Match.yes || m === Match.maybe;
}