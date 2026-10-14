import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { processDocument } from "./parse-document";
import { DocumentProcessingException } from "./document-processing-error";

const questionText = [
  "1. Which answer is correct?",
  "A) First choice",
  "B) Second choice",
  "C) Third choice",
  "D) Fourth choice",
  "Answer Key",
  "1. B",
].join("\n");

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createDocxFixture(documentText: string, expandedSizeIncrease = 0) {
  const files = [
    [
      "[Content_Types].xml",
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${documentText
        .split("\n")
        .map(
          (line) =>
            `<w:p><w:r><w:t xml:space="preserve">${line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</w:t></w:r></w:p>`,
        )
        .join("")}<w:sectPr/></w:body></w:document>`,
    ],
  ] as const;

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const [name, source] of files) {
    const fileName = new TextEncoder().encode(name);
    const original = new TextEncoder().encode(source);
    const compressed = deflateRawSync(original);
    const checksum = crc32(original);

    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 8, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, compressed.length, true);
    localView.setUint32(22, original.length, true);
    localView.setUint16(26, fileName.length, true);
    localParts.push(localHeader, fileName, compressed);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 8, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, compressed.length, true);
    centralView.setUint32(24, original.length + expandedSizeIncrease, true);
    centralView.setUint16(28, fileName.length, true);
    centralView.setUint32(42, localOffset, true);
    centralParts.push(centralHeader, fileName);

    localOffset += localHeader.length + fileName.length + compressed.length;
  }

  const centralDirectory = concatenate(centralParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);
  return concatenate([...localParts, centralDirectory, endRecord]);
}

function concatenate(parts: readonly Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function createPdfFixture(lines: readonly string[]) {
  const escapePdfText = (text: string) =>
    text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const commands = ["BT", "/F1 12 Tf", "50 750 Td"];
  lines.forEach((line, index) => {
    if (index > 0) commands.push("0 -18 Td");
    commands.push(`(${escapePdfText(line)}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

async function expectProcessingError(
  document: { fileName: string; mediaType: string; contents: Uint8Array },
  code: string,
) {
  try {
    await processDocument(document);
    throw new Error(`Expected a ${code} document processing error.`);
  } catch (error) {
    expect(error).toBeInstanceOf(DocumentProcessingException);
    expect((error as DocumentProcessingException).details.code).toBe(code);
  }
}

describe("processDocument", () => {
  it("parses a UTF-8 TXT question with irregular whitespace", async () => {
    const result = await processDocument({
      fileName: "study.txt",
      mediaType: "text/plain",
      contents: new TextEncoder().encode(
        "\uFEFFQ1:\t Choose the answer\r\nA)\u00a0First\rB) Second\r\nC) Third\rD) Fourth\r\nAnswers: 1-C",
      ),
    });

    expect(result).toMatchObject({
      status: "completed",
      totalQuestions: 1,
      validQuestions: 1,
      questionsRequiringReview: 0,
    });
    expect(result.questions[0].correctOption).toBe("C");
    expect(result.questions[0].sourcePageNumbers).toEqual([]);
  });

  it("uses Mammoth to parse a real minimal DOCX archive", async () => {
    const result = await processDocument({
      fileName: "study.docx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      contents: createDocxFixture(questionText),
    });

    expect(result.totalQuestions).toBe(1);
    expect(result.validQuestions).toBe(1);
    expect(result.questions[0].correctOption).toBe("B");
  });

  it("uses the PDF.js Node legacy entry point to extract text and source pages", async () => {
    const result = await processDocument({
      fileName: "study.pdf",
      mediaType: "application/pdf",
      contents: createPdfFixture(questionText.split("\n")),
    });

    expect(result.totalQuestions).toBe(1);
    expect(result.validQuestions).toBe(1);
    expect(result.questions[0].correctOption).toBe("B");
    expect(result.questions[0].sourcePageNumbers).toEqual([1]);
  });

  it("rejects empty, corrupt, mismatched, and unsupported uploads", async () => {
    await expectProcessingError(
      { fileName: "empty.txt", mediaType: "text/plain", contents: new Uint8Array() },
      "empty_file",
    );
    await expectProcessingError(
      {
        fileName: "broken.pdf",
        mediaType: "application/pdf",
        contents: new TextEncoder().encode("%PDF-not a real PDF"),
      },
      "corrupt_document",
    );
    await expectProcessingError(
      {
        fileName: "fake.pdf",
        mediaType: "application/pdf",
        contents: new TextEncoder().encode("not a PDF"),
      },
      "invalid_signature",
    );
    await expectProcessingError(
      {
        fileName: "question.txt",
        mediaType: "application/pdf",
        contents: new TextEncoder().encode(questionText),
      },
      "mime_type_mismatch",
    );
    await expectProcessingError(
      {
        fileName: "notes.doc",
        mediaType: "application/msword",
        contents: new TextEncoder().encode("content"),
      },
      "unsupported_type",
    );
  });

  it("reports textless PDFs as unsupported OCR, not as successfully parsed", async () => {
    await expectProcessingError(
      {
        fileName: "scan.pdf",
        mediaType: "application/pdf",
        contents: createPdfFixture([]),
      },
      "ocr_unsupported",
    );
  });

  it("reports invalid UTF-8 text and corrupt DOCX archives explicitly", async () => {
    await expectProcessingError(
      {
        fileName: "bad.txt",
        mediaType: "text/plain",
        contents: new Uint8Array([0xc3, 0x28]),
      },
      "corrupt_document",
    );
    await expectProcessingError(
      {
        fileName: "bad.docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        contents: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]),
      },
      "corrupt_document",
    );
  });

  it("rejects configured upload overages and DOCX expansion bombs", async () => {
    const originalMaxBytes = process.env.MAX_DOCUMENT_UPLOAD_BYTES;
    process.env.MAX_DOCUMENT_UPLOAD_BYTES = "1024";
    try {
      await expectProcessingError(
        {
          fileName: "large.txt",
          mediaType: "text/plain",
          contents: new Uint8Array(1_025),
        },
        "resource_limit",
      );
    } finally {
      if (originalMaxBytes === undefined) {
        delete process.env.MAX_DOCUMENT_UPLOAD_BYTES;
      } else {
        process.env.MAX_DOCUMENT_UPLOAD_BYTES = originalMaxBytes;
      }
    }

    await expectProcessingError(
      {
        fileName: "inflated.docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        contents: createDocxFixture(questionText, 21 * 1_024 * 1_024),
      },
      "resource_limit",
    );
  });
});
