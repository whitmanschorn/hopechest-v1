import Link from "next/link";
import type { ReactNode } from "react";
import { makeResolver, parseMarkup, type Inline, type LinkTarget } from "@/lib/wiki/markup";
import { newPath } from "@/lib/wiki/paths";
import classes from "./Article.module.css";

/**
 * An article's text, drawn. Used for the saved page and for the editor's
 * preview, so the two always agree. Text is only ever placed as text.
 */
export function ArticleBody({
  source,
  targets,
  canCreate,
}: {
  source: string;
  targets: readonly LinkTarget[];
  /** Whether a link to a page that does not exist offers to start it. */
  canCreate: boolean;
}) {
  const resolve = makeResolver(targets);
  const inline = (nodes: readonly Inline[]): ReactNode =>
    nodes.map((node, index) => {
      if (node.type === "text") return <span key={index}>{node.text}</span>;
      if (node.type === "bold") return <strong key={index}>{inline(node.children)}</strong>;
      if (node.type === "italic") return <em key={index}>{inline(node.children)}</em>;
      if (node.type === "link") {
        return (
          <a key={index} href={node.href} target="_blank" rel="noreferrer nofollow">
            {node.label}
          </a>
        );
      }
      const href = resolve(node.target);
      if (href) {
        return (
          <Link key={index} href={href} data-testid="wiki-link">
            {node.label}
          </Link>
        );
      }
      return canCreate ? (
        <Link
          key={index}
          href={newPath(node.target)}
          className={classes.missing}
          title="This page has not been written yet"
          data-testid="wiki-link-missing"
        >
          {node.label}
        </Link>
      ) : (
        <span key={index}>{node.label}</span>
      );
    });

  return (
    <div className={classes.body} data-testid="article-body">
      {parseMarkup(source).map((block, index) => {
        if (block.type === "heading") {
          const Tag = block.level === 2 ? "h2" : "h3";
          return (
            <Tag key={index} id={block.id}>
              {inline(block.children)}
            </Tag>
          );
        }
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={index}>
              {block.items.map((item, at) => (
                <li key={at}>{inline(item)}</li>
              ))}
            </Tag>
          );
        }
        if (block.type === "quote")
          return <blockquote key={index}>{inline(block.children)}</blockquote>;
        return <p key={index}>{inline(block.children)}</p>;
      })}
    </div>
  );
}
