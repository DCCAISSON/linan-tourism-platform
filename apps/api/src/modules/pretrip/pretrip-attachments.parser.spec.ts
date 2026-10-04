import { BadRequestException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { parsePretripAttachmentUpload, PRETRIP_ATTACHMENT_MAX_BYTES } from "./pretrip-attachments.parser.js"

const body = { title: "行前须知", expectedVersion: "2" }
const pdf = Buffer.from("%PDF-1.4\n%%EOF")
const file = { originalname: "须知.pdf", mimetype: "application/pdf", buffer: pdf, size: pdf.length }

describe("pretrip file upload boundary", () => {
  it("derives an accepted PDF format from the actual upload without accepting object keys", () => {
    expect(parsePretripAttachmentUpload(file, body)).toEqual({ title: body.title, expectedVersion: 2, body: pdf, contentType: "application/pdf", extension: "pdf" })
  })

  it.each([
    { ...file, buffer: Buffer.from("<html>not a PDF</html>"), size: 22 },
    { ...file, mimetype: "text/html" },
    { ...file, originalname: "file.exe" },
    { ...file, buffer: Buffer.alloc(0), size: 0 },
    { ...file, buffer: Buffer.alloc(PRETRIP_ATTACHMENT_MAX_BYTES + 1), size: PRETRIP_ATTACHMENT_MAX_BYTES + 1 },
  ])("rejects unsupported, mismatched or oversized bytes", (input) => {
    expect(() => parsePretripAttachmentUpload(input, body)).toThrow(BadRequestException)
  })

  it("accepts a Word container for native DOC preview", () => {
    const bytes = Buffer.from("d0cf11e0a1b11ae100000000", "hex")
    expect(parsePretripAttachmentUpload({ originalname: "须知.doc", mimetype: "application/msword", buffer: bytes, size: bytes.length }, body)).toMatchObject({ extension: "doc", contentType: "application/msword" })
  })

  it("does not accept an arbitrary ZIP as a DOCX", () => {
    const bytes = Buffer.from("504b030400000000", "hex")
    expect(() => parsePretripAttachmentUpload({ originalname: "压缩包.docx", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: bytes, size: bytes.length }, body)).toThrow(BadRequestException)
  })
})
