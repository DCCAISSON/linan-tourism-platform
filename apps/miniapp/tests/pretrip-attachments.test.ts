import { afterEach, describe, expect, it, vi } from "vitest"
import { createPretripApi, formatPretripGatheringTime } from "../src/pretrip-api"

const attachment = { id: "file-1", title: "行前须知.pdf", contentType: "application/pdf", byteSize: 128 }
const link = { url: "/orders/order-1/pretrip/attachments/file-1/download?expiresAt=2027-01-01T00%3A00%3A00.000Z", expiresAt: "2027-01-01T00:00:00.000Z" }

describe("opening an order attachment", () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"])("downloads %s with identity before native document preview", async (contentType) => {
    const downloads: UniNamespace.DownloadFileOption[] = []
    const documents: UniNamespace.OpenDocumentOptions[] = []
    vi.stubGlobal("uni", {
      downloadFile: (options: UniNamespace.DownloadFileOption) => { downloads.push(options); options.success?.({ statusCode: 200, tempFilePath: "wxfile://download" }) },
      openDocument: (options: UniNamespace.OpenDocumentOptions) => { documents.push(options); options.success?.({ errMsg: "openDocument:ok" }) },
    })
    const api = createPretripApi({ baseUrl: "https://api.example.test", wechatSessionToken: "session-token", request: async () => ({ statusCode: 201, data: link }) })

    await api.openAttachment("order-1", { ...attachment, contentType })

    expect(downloads).toHaveLength(1)
    expect(downloads[0]).toMatchObject({ url: `https://api.example.test${link.url}`, header: { Authorization: "Bearer session-token" } })
    expect(documents[0]).toMatchObject({ filePath: "wxfile://download", fileType: contentType === "application/pdf" ? "pdf" : contentType === "application/msword" ? "doc" : "docx" })
  })

  it("previews a downloaded image instead of trying to open it as a document", async () => {
    const preview = vi.fn((options: UniNamespace.PreviewImageOptions) => options.success?.({ errMsg: "previewImage:ok" }))
    vi.stubGlobal("uni", { downloadFile: (options: UniNamespace.DownloadFileOption) => options.success?.({ statusCode: 200, tempFilePath: "wxfile://image" }), previewImage: preview })
    const api = createPretripApi({ request: async () => ({ statusCode: 201, data: link }) })

    await api.openAttachment("order-1", { ...attachment, contentType: "image/png" })

    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ urls: ["wxfile://image"] }))
  })

  it("does not preview an expired or rejected download response", async () => {
    const openDocument = vi.fn()
    vi.stubGlobal("uni", { downloadFile: (options: UniNamespace.DownloadFileOption) => options.success?.({ statusCode: 410, tempFilePath: "wxfile://error" }), openDocument })
    const api = createPretripApi({ request: async () => ({ statusCode: 201, data: link }) })

    await expect(api.openAttachment("order-1", attachment)).rejects.toThrow()

    expect(openDocument).not.toHaveBeenCalled()
  })

  it("never sends the login header to an external attachment address", async () => {
    const downloadFile = vi.fn()
    vi.stubGlobal("uni", { downloadFile })
    const api = createPretripApi({ wechatSessionToken: "session-token", request: async () => ({ statusCode: 201, data: { ...link, url: "https://external.example.test/document" } }) })

    await expect(api.openAttachment("order-1", attachment)).rejects.toThrow()

    expect(downloadFile).not.toHaveBeenCalled()
  })
})

describe("gathering time shown in Beijing time", () => {
  it.each([
    ["2027-02-01T01:00:00.000Z", "2027-02-01 09:00"],
    ["2027-02-01T09:00:00+08:00", "2027-02-01 09:00"],
    ["2027-02-01T18:00:00.000Z", "2027-02-02 02:00"],
    [null, "时间待通知"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatPretripGatheringTime(input)).toBe(expected)
  })
})
