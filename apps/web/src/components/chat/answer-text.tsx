// Renders a model answer safely: paragraphs, numbered/bulleted lists, **bold**, and [n] citation
// buttons. It builds React elements from plain text (no dangerouslySetInnerHTML), so model output
// can never inject HTML or scripts into the page (XSS-safe).
import type { ReactNode } from 'react';

interface Props {
  text: string;
  /** Called when a [n] citation is clicked. */
  onCite: (id: number) => void;
  /** Citation ids that point at a real source (others are shown as plain text). */
  validIds: number[];
  /**
   * Join wrapped lines inside a paragraph with spaces (for Markdown source files, which are
   * hard-wrapped). Off for model answers, where a line break is meaningful.
   */
  softWrap?: boolean;
}

function renderInline(line: string, props: Props, keyPrefix: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return <strong key={key}>{bold[1]}</strong>;
    const cite = /^\[(\d+)\]$/.exec(part);
    if (cite) {
      const id = Number(cite[1]);
      if (!props.validIds.includes(id)) return part;
      return (
        <button
          key={key}
          type="button"
          className="cite"
          onClick={() => props.onCite(id)}
          aria-label={`Open source ${id}`}
        >
          {id}
        </button>
      );
    }
    return part;
  });
}

export function AnswerText(props: Props) {
  const blocks = props.text.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  return (
    <div className="answer-text">
      {blocks.map((block, b) => {
        const lines = block.split('\n').filter((l) => l.trim());
        const numbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
        const bulleted = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        if (lines.length > 0 && (numbered || bulleted)) {
          const items = lines.map((l, i) => (
            <li key={i}>
              {renderInline(l.replace(/^\s*(\d+[.)]|[-*•])\s+/, ''), props, `${b}-${i}`)}
            </li>
          ));
          return numbered ? <ol key={b}>{items}</ol> : <ul key={b}>{items}</ul>;
        }
        if (props.softWrap) {
          return <p key={b}>{renderInline(lines.join(' '), props, `${b}`)}</p>;
        }
        return (
          <p key={b}>
            {lines.map((l, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {renderInline(l, props, `${b}-${i}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
