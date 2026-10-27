import { InputRule, inputRules, textblockTypeInputRule, smartQuotes, ellipsis } from "prosemirror-inputrules";
import { schema } from "./schema";

/**
 * Formatting as you type: Markdown-style prefixes at the start of a block, and
 * typographic punctuation (curly quotes, ellipsis, en and em dashes).
 */
export function rampaiInputRules() {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^##\s$/, schema.nodes.heading2),
      textblockTypeInputRule(/^#\s$/, schema.nodes.heading1),
      textblockTypeInputRule(/^>\s$/, schema.nodes.quote),
      textblockTypeInputRule(/^[-*]\s$/, schema.nodes.list_item),
      ...smartQuotes,
      ellipsis,
      new InputRule(/–-$/, "—"),
      new InputRule(/--$/, "–"),
    ],
  });
}
