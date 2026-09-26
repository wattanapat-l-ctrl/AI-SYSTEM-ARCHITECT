/**
 * Lightweight Markdown -> PDF renderer built on jsPDF.
 *
 * jsPDF is imported dynamically so it is only bundled in the browser and
 * never pulled into a server render.
 *
 * The renderer is intentionally simple: it walks the Markdown line by line
 * and maps structure onto font size and spacing rather than trying to do full
 * layout. That keeps output deterministic and avoids a headless browser.
 */

export interface PdfOptions {
  title: string;
  subtitle?: string;
  footer?: string;
}

interface Block {
  type:
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "p"
    | "bullet"
    | "number"
    | "code"
    | "quote"
    | "rule"
    | "table"
    | "spacer";
  text: string;
  rows?: string[][];
}

function stripInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // fenced code
    if (trimmed.startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    // table
    if (trimmed.startsWith("|") && lines[i + 1]?.trim().match(/^\|[\s:|-]+\|$/)) {
      const rows: string[][] = [];
      const readRow = (l: string) =>
        l
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => stripInline(c.trim()));

      rows.push(readRow(trimmed));
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(readRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", text: "", rows });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "rule", text: "" });
      i += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push({
        type: level === 1 ? "h1" : level === 2 ? "h2" : level === 3 ? "h3" : "h4",
        text: stripInline(heading[2]),
      });
      i += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      blocks.push({ type: "quote", text: stripInline(trimmed.replace(/^>+\s?/, "")) });
      i += 1;
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      blocks.push({ type: "bullet", text: stripInline(bullet[1]) });
      i += 1;
      continue;
    }

    const numbered = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      blocks.push({ type: "number", text: `${numbered[1]}. ${stripInline(numbered[2])}` });
      i += 1;
      continue;
    }

    // indented continuation under a bullet
    if (/^\s{2,}/.test(line) && blocks.length > 0 && blocks[blocks.length - 1].type === "bullet") {
      blocks.push({ type: "bullet", text: stripInline(trimmed) });
      i += 1;
      continue;
    }

    blocks.push({ type: "p", text: stripInline(trimmed) });
    i += 1;
  }

  return blocks;
}

const STYLES: Record<
  Block["type"],
  { size: number; style: "normal" | "bold" | "italic" | "mono"; gapBefore: number; gapAfter: number }
> = {
  h1: { size: 20, style: "bold", gapBefore: 12, gapAfter: 8 },
  h2: { size: 16, style: "bold", gapBefore: 14, gapAfter: 6 },
  h3: { size: 13, style: "bold", gapBefore: 11, gapAfter: 5 },
  h4: { size: 11, style: "bold", gapBefore: 9, gapAfter: 4 },
  p: { size: 10, style: "normal", gapBefore: 2, gapAfter: 6 },
  bullet: { size: 10, style: "normal", gapBefore: 1, gapAfter: 2 },
  number: { size: 10, style: "normal", gapBefore: 1, gapAfter: 2 },
  code: { size: 8.5, style: "mono", gapBefore: 6, gapAfter: 8 },
  quote: { size: 9.5, style: "italic", gapBefore: 4, gapAfter: 6 },
  rule: { size: 10, style: "normal", gapBefore: 6, gapAfter: 6 },
  table: { size: 8.5, style: "normal", gapBefore: 6, gapAfter: 8 },
  spacer: { size: 10, style: "normal", gapBefore: 0, gapAfter: 4 },
};

/** Renders markdown to a PDF and triggers a browser download. */
export async function markdownToPdf(
  markdown: string,
  options: PdfOptions,
): Promise<{ pages: number }> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;
  let page = 1;

  const setFont = (type: Block["type"]) => {
    const s = STYLES[type];
    doc.setFont(s.style === "mono" ? "courier" : "helvetica", s.style === "mono" ? "normal" : s.style);
    doc.setFontSize(s.size);
  };

  const footer = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 146, 160);
    doc.text(text, margin, pageHeight - 28);
    doc.text(String(page), pageWidth - margin, pageHeight - 28, { align: "right" });
  };

  const newPage = () => {
    footer(options.footer ?? options.title);
    doc.addPage();
    page += 1;
    y = margin;
  };

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - 60) newPage();
  };

  /* ---- cover ---- */
  doc.setTextColor(79, 70, 229);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("AI SYSTEM ARCHITECT", margin, y);
  y += 26;

  doc.setTextColor(20, 24, 34);
  doc.setFontSize(24);
  const titleLines = doc.splitTextToSize(options.title, maxWidth) as string[];
  for (const t of titleLines) {
    doc.text(t, margin, y);
    y += 28;
  }
  y += 4;

  if (options.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(100, 110, 130);
    for (const t of doc.splitTextToSize(options.subtitle, maxWidth) as string[]) {
      doc.text(t, margin, y);
      y += 16;
    }
  }

  y += 10;
  doc.setDrawColor(225, 228, 235);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 22;

  /* ---- body ---- */
  for (const block of parseBlocks(markdown)) {
    // skip the leading H1/H2 that duplicate the cover title
    if ((block.type === "h1" || block.type === "h2") && y < margin + 6) {
      continue;
    }

    const style = STYLES[block.type];
    y += style.gapBefore;

    if (block.type === "rule") {
      ensure(20);
      doc.setDrawColor(228, 231, 238);
      doc.line(margin, y, pageWidth - margin, y);
      y += 12;
      continue;
    }

    if (block.type === "table" && block.rows && block.rows.length > 0) {
      const cols = Math.max(...block.rows.map((r) => r.length));
      if (cols === 0) continue;
      const colWidth = maxWidth / cols;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(60, 66, 82);

      for (let r = 0; r < block.rows.length; r++) {
        const cells = block.rows[r];
        const wrapped = cells.map((cell) =>
          doc.splitTextToSize(cell || "", colWidth - 6) as string[],
        );
        const rowHeight = Math.max(...wrapped.map((w) => w.length)) * 10 + 6;

        ensure(rowHeight + 4);
        if (r === 0) {
          doc.setFillColor(243, 244, 248);
          doc.rect(margin, y - 9, maxWidth, rowHeight, "F");
        } else if (r % 2 === 0) {
          doc.setFillColor(250, 250, 252);
          doc.rect(margin, y - 9, maxWidth, rowHeight, "F");
        }

        if (r === 0) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(40, 46, 62);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(70, 76, 92);
        }

        wrapped.forEach((lines, c) => {
          lines.forEach((line, li) => {
            doc.text(line, margin + c * colWidth + 3, y + li * 10);
          });
        });

        y += rowHeight;
      }

      y += 6;
      continue;
    }

    setFont(block.type);
    doc.setTextColor(30, 35, 48);

    if (block.type === "bullet" || block.type === "number") {
      const indent = block.type === "number" ? 20 : 16;
      const lines = doc.splitTextToSize(block.text, maxWidth - indent) as string[];
      ensure(lines.length * 12 + 4);
      lines.forEach((line, li) => {
        if (li === 0) {
          doc.setTextColor(140, 146, 160);
          doc.circle(margin + 5, y - 3, 1.6, "F");
          if (block.type === "number") {
            doc.setTextColor(140, 146, 160);
            doc.text(block.text.split(".")[0] + ".", margin + 2, y);
          }
          doc.setTextColor(30, 35, 48);
        }
        doc.text(line, margin + indent, y);
        y += 12;
      });
      y += style.gapAfter;
      continue;
    }

    if (block.type === "quote") {
      const lines = doc.splitTextToSize(block.text, maxWidth - 18) as string[];
      ensure(lines.length * 12 + 8);
      doc.setFillColor(246, 247, 250);
      doc.rect(margin, y - 9, maxWidth, lines.length * 12 + 10, "F");
      doc.setDrawColor(199, 210, 254);
      doc.setLineWidth(2);
      doc.line(margin, y - 9, margin, y - 9 + lines.length * 12 + 10);
      doc.setTextColor(90, 98, 120);
      lines.forEach((line) => {
        doc.text(line, margin + 12, y);
        y += 12;
      });
      y += style.gapAfter;
      continue;
    }

    if (block.type === "code") {
      const lines = block.text.split("\n");
      ensure(Math.min(lines.length, 20) * 10 + 14);
      const shown = lines.slice(0, 40);
      const height = shown.length * 10 + 12;

      if (y + height > pageHeight - 60) newPage();

      doc.setFillColor(248, 249, 251);
      doc.rect(margin, y - 9, maxWidth, height, "F");
      doc.setDrawColor(232, 234, 240);
      doc.setLineWidth(0.5);
      doc.rect(margin, y - 9, maxWidth, height);
      doc.setTextColor(50, 58, 78);
      for (const line of shown) {
        doc.text(line.replace(/\t/g, "  ").slice(0, 110), margin + 8, y);
        y += 10;
      }
      if (lines.length > 40) {
        doc.text(`... ${lines.length - 40} more lines`, margin + 8, y);
      }
      y += 14;
      continue;
    }

    const lines = doc.splitTextToSize(block.text, maxWidth) as string[];
    for (const line of lines) {
      ensure(14);
      doc.text(line, margin, y);
      y += block.type.startsWith("h") ? style.size * 1.45 : 13;
    }
    y += style.gapAfter;
  }

  footer(options.footer ?? options.title);
  const filename = `${options.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "document"}.pdf`;
  doc.save(filename);

  return { pages: page };
}
