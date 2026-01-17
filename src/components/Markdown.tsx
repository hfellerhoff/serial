// src/components/Markdown.tsx
import { Link } from "@tanstack/react-router";
import parse, {
  type HTMLReactParserOptions,
  type DOMNode,
  domToReact,
  Element,
} from "html-react-parser";
import { useEffect, useState } from "react";
import { MarkdownResult, renderMarkdown } from "~/lib/markdown";

type MarkdownProps = {
  content: string;
  className?: string;
};

export function Markdown({ content, className }: MarkdownProps) {
  const [result, setResult] = useState<MarkdownResult | null>(null);

  useEffect(() => {
    renderMarkdown(content).then(setResult);
  }, [content]);

  if (!result) {
    return <div className={className}>Loading...</div>;
  }

  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element) {
        // Customize rendering of specific elements
        if (domNode.name === "a") {
          // Handle links
          const href = domNode.attribs.href;
          if (href?.startsWith("/")) {
            // Internal link - use your router's Link component
            return (
              <Link to={href}>{domToReact(domNode.children as DOMNode[], options)}</Link>
            );
          }
        }

        if (domNode.name === "img") {
          // Add lazy loading to images
          return (
            <img
              {...domNode.attribs}
              loading="lazy"
              className="rounded-lg shadow-md"
            />
          );
        }
      }
    },
  };

  return <div className={className}>{parse(result.markup, options)}</div>;
}
