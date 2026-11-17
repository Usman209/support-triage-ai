// Markdown-aware chunker for knowledge-base articles.
//
// 1. Read the front-matter (title, subject, ...).
// 2. Split the body at headings, so a chunk never mixes two topics.
// 3. Pack paragraphs into chunks of at most `chunkSize` characters; if a section is longer,
//    the next chunk repeats the last `overlap` characters so a sentence cut at a boundary
//    still appears whole in one chunk.
// 4. Prefix every chunk with "Title > Section". Without it, a chunk like "Wait 15 minutes, then
//    reset your password" loses its context; with it, retrieval and citations are much better.

export interface ParsedDocument {
  title: string;
  /** Front-matter fields (strings), e.g. subject, sample. */
  meta: Record<string, string>;
  body: string;
}

export interface TextChunk {
  index: number;
  /** Text that is embedded and stored (includes the "Title > Section" header). */
  content: string;
  /** Section heading the chunk belongs to. */
  heading: string;
  /** Rough token count (≈ 4 characters per token for English). Good enough for budgeting. */
  tokenEstimate: number;
}

export interface ChunkOptions {
  chunkSize: number;
  overlap: number;
}

/** Parse a simple `---` front-matter block with `key: value` lines. */
export function parseDocument(raw: string, fallbackTitle: string): ParsedDocument {
  const text = raw.replace(/\r\n/g, '\n');
  const meta: Record<string, string> = {};
  let body = text;

  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (match) {
    for (const line of (match[1] ?? '').split('\n')) {
      const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
      if (kv?.[1]) meta[kv[1]] = (kv[2] ?? '').trim();
    }
    body = text.slice(match[0].length);
  }

  const h1 = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  return { title: meta.title || h1 || fallbackTitle, meta, body };
}

interface Section {
  heading: string;
  text: string;
}

function splitSections(body: string, title: string): Section[] {
  const sections: Section[] = [];
  let heading = title;
  let lines: string[] = [];

  const flush = () => {
    const text = lines.join('\n').trim();
    if (text) sections.push({ heading, text });
    lines = [];
  };

  for (const line of body.split('\n')) {
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if (h) {
      flush();
      // The H1 is the document title; deeper headings are sections.
      heading = (h[1] ?? '').length === 1 ? title : (h[2] ?? '').trim();
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

/** Last `n` characters, starting at a word boundary so we don't begin mid-word. */
function tail(text: string, n: number): string {
  if (n <= 0 || text.length <= n) return n <= 0 ? '' : text;
  const cut = text.slice(text.length - n);
  const space = cut.indexOf(' ');
  return space >= 0 ? cut.slice(space + 1) : cut;
}

/** Split text that is longer than `size` into pieces at word boundaries. */
function hardSplit(text: string, size: number): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf(' ', size);
    if (cut <= 0) cut = size;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

export function chunkDocument(doc: ParsedDocument, options: ChunkOptions): TextChunk[] {
  const { chunkSize, overlap } = options;
  if (overlap >= chunkSize)
    throw new Error('RAG_CHUNK_OVERLAP must be smaller than RAG_CHUNK_SIZE');

  const chunks: TextChunk[] = [];
  const push = (heading: string, text: string) => {
    const header = heading === doc.title ? doc.title : `${doc.title} > ${heading}`;
    const content = `${header}\n\n${text.trim()}`;
    chunks.push({
      index: chunks.length,
      content,
      heading,
      tokenEstimate: Math.ceil(content.length / 4),
    });
  };

  for (const section of splitSections(doc.body, doc.title)) {
    // Paragraphs (and list blocks) are separated by blank lines.
    const paragraphs = section.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap((p) => (p.length > chunkSize ? hardSplit(p, chunkSize) : [p]));

    let current = '';
    for (const paragraph of paragraphs) {
      const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
      if (candidate.length <= chunkSize || !current) {
        current = candidate;
      } else {
        push(section.heading, current);
        const carry = tail(current, overlap);
        current = carry ? `${carry}\n\n${paragraph}` : paragraph;
      }
    }
    if (current) push(section.heading, current);
  }
  return chunks;
}
