import csvToMarkdown from 'csv-to-markdown-table'
import * as XLSX from 'xlsx'

type PdfTextItem = {
  str: string
  transform: number[]
  width: number
  height: number
}

type PdfTextMarkedContent = {
  type: string
}

type PositionedTextItem = {
  x: number
  y: number
  width: number
  height: number
  text: string
}

type TextRow = {
  y: number
  items: PositionedTextItem[]
}

const pdfjsGlobal = globalThis as typeof globalThis & {
  DOMMatrix?: unknown
  pdfjsWorker?: {
    WorkerMessageHandler?: unknown
  }
}

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
type PdfJsWorkerModule = typeof import('pdfjs-dist/legacy/build/pdf.worker.mjs')
type NodeDOMMatrixInit = Iterable<number> | { a?: number, b?: number, c?: number, d?: number, e?: number, f?: number }
type OfficeParserModule = typeof import('officeparser')

let pdfJsModulePromise: Promise<PdfJsModule> | null = null
let officeParserModulePromise: Promise<OfficeParserModule> | null = null

class NodeDOMMatrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number

  static fromFloat32Array(array32: Float32Array): NodeDOMMatrix {
    return new NodeDOMMatrix(Array.from(array32))
  }

  static fromFloat64Array(array64: Float64Array): NodeDOMMatrix {
    return new NodeDOMMatrix(Array.from(array64))
  }

  static fromMatrix(other?: { a?: number, b?: number, c?: number, d?: number, e?: number, f?: number }): NodeDOMMatrix {
    return new NodeDOMMatrix(other)
  }

  constructor(init?: NodeDOMMatrixInit) {
    this.a = 1
    this.b = 0
    this.c = 0
    this.d = 1
    this.e = 0
    this.f = 0

    if (!init) {
      return
    }

    if (isMatrixIterable(init)) {
      const values = Array.from(init as Iterable<number>)
      if (values.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = values
      }
      return
    }

    this.a = init.a ?? this.a
    this.b = init.b ?? this.b
    this.c = init.c ?? this.c
    this.d = init.d ?? this.d
    this.e = init.e ?? this.e
    this.f = init.f ?? this.f
  }

  multiplySelf(other: NodeDOMMatrix): NodeDOMMatrix {
    const a = this.a * other.a + this.c * other.b
    const b = this.b * other.a + this.d * other.b
    const c = this.a * other.c + this.c * other.d
    const d = this.b * other.c + this.d * other.d
    const e = this.a * other.e + this.c * other.f + this.e
    const f = this.b * other.e + this.d * other.f + this.f
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.e = e
    this.f = f
    return this
  }

  preMultiplySelf(other: NodeDOMMatrix): NodeDOMMatrix {
    const current = new NodeDOMMatrix(this)
    return this.copyFrom(other).multiplySelf(current)
  }

  translate(tx = 0, ty = 0): NodeDOMMatrix {
    return this.multiplySelf(new NodeDOMMatrix([1, 0, 0, 1, tx, ty]))
  }

  scale(scaleX = 1, scaleY = scaleX): NodeDOMMatrix {
    return this.multiplySelf(new NodeDOMMatrix([scaleX, 0, 0, scaleY, 0, 0]))
  }

  invertSelf(): NodeDOMMatrix {
    const determinant = this.a * this.d - this.b * this.c
    if (!determinant) {
      this.a = Number.NaN
      this.b = Number.NaN
      this.c = Number.NaN
      this.d = Number.NaN
      this.e = Number.NaN
      this.f = Number.NaN
      return this
    }

    const a = this.d / determinant
    const b = -this.b / determinant
    const c = -this.c / determinant
    const d = this.a / determinant
    const e = (this.c * this.f - this.d * this.e) / determinant
    const f = (this.b * this.e - this.a * this.f) / determinant
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.e = e
    this.f = f
    return this
  }

  private copyFrom(other: NodeDOMMatrix): NodeDOMMatrix {
    this.a = other.a
    this.b = other.b
    this.c = other.c
    this.d = other.d
    this.e = other.e
    this.f = other.f
    return this
  }
}

function ensurePdfJsDomMatrix(): void {
  if (!pdfjsGlobal.DOMMatrix) {
    pdfjsGlobal.DOMMatrix = NodeDOMMatrix as unknown as typeof DOMMatrix
  }
}

function isMatrixIterable(init: NodeDOMMatrixInit): init is Iterable<number> {
  const candidate = init as { [Symbol.iterator]?: () => Iterator<number> }
  return typeof candidate[Symbol.iterator] === 'function'
}

async function loadPdfJsModule(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = (async () => {
      ensurePdfJsDomMatrix()
      const [pdfJsModule, pdfJsWorkerModule] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
      ])
      const workerModule = pdfJsWorkerModule as PdfJsWorkerModule
      if (!pdfjsGlobal.pdfjsWorker?.WorkerMessageHandler) {
        pdfjsGlobal.pdfjsWorker = workerModule
      }
      return pdfJsModule
    })()
  }

  return pdfJsModulePromise
}

async function loadOfficeParserModule(): Promise<OfficeParserModule> {
  if (!officeParserModulePromise) {
    officeParserModulePromise = import('officeparser')
  }

  return officeParserModulePromise
}

function isTextItem(item: PdfTextItem | PdfTextMarkedContent): item is PdfTextItem {
  return 'str' in item && Array.isArray(item.transform)
}

function toPositionedTextItem(item: PdfTextItem): PositionedTextItem | null {
  const text = item.str.replace(/\s+/g, ' ').trim()
  if (!text) {
    return null
  }
  return {
    x: item.transform[4],
    y: item.transform[5],
    width: Math.abs(item.width || 0),
    height: Math.abs(item.height || item.transform[0] || item.transform[3] || 0),
    text,
  }
}

function textGapThreshold(item: PositionedTextItem): number {
  const averageCharWidth = item.text.length > 0 ? item.width / item.text.length : 0
  return Math.max(1.5, averageCharWidth * 0.35)
}

function looksLikeUrlContinuation(previous: string, current: PositionedTextItem, gap: number): boolean {
  if (!previous || !current) {
    return false
  }

  return (
    gap <= Math.max(1.5, textGapThreshold(current) * 1.5) &&
    !/\s/.test(current.text) &&
    /(?:https?:\/\/|www\.|[A-Za-z0-9.-]+\.[A-Za-z]{2,}.*\/)[^\s]*$/i.test(previous) &&
    /^[A-Za-z0-9]/.test(current.text)
  )
}

function shouldInsertSpace(previous: string, current: PositionedTextItem, gap: number): boolean {
  if (!previous) {
    return false
  }

  if (looksLikeUrlContinuation(previous, current, gap)) {
    return false
  }
  if (gap > 0.1 && (current.text === '\'' || previous === '\'')) {
    return true
  }
  if (/[A-Za-z]$/.test(previous) && previous.length > 2 && /^\d/.test(current.text) && !/[/.@:]/.test(previous)) {
    return true
  }
  if (/\d$/.test(previous) && /^[a-z]/.test(current.text)) {
    return true
  }
  if (/\d$/.test(previous) && /^[A-Z]{2,}\b/.test(current.text)) {
    return true
  }
  if (gap <= textGapThreshold(current)) {
    return false
  }
  if (/[([{"“‘-]$/.test(previous)) {
    return false
  }
  if (/^[,.;:!?%)\]}"”’]/.test(current.text)) {
    return false
  }
  return true
}

function groupRows(items: PositionedTextItem[]): TextRow[] {
  const rows: TextRow[] = []

  for (const item of items) {
    const tolerance = Math.max(2, item.height * 0.5)
    const row = rows.find(existing => Math.abs(existing.y - item.y) <= tolerance)
    if (row) {
      row.items.push(item)
      row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length
    } else {
      rows.push({ y: item.y, items: [item] })
    }
  }

  return rows.sort((a, b) => b.y - a.y)
}

function dedupeOverlappingItems(items: PositionedTextItem[]): PositionedTextItem[] {
  const deduped: PositionedTextItem[] = []

  for (const item of items) {
    const duplicate = deduped.find(existing =>
      existing.text === item.text &&
      Math.abs(existing.x - item.x) <= 1 &&
      Math.abs(existing.y - item.y) <= 1 &&
      Math.abs(existing.width - item.width) <= 1 &&
      Math.abs(existing.height - item.height) <= 1,
    )

    if (!duplicate) {
      deduped.push(item)
    }
  }

  return deduped
}

function isDecorativeMarker(item: PositionedTextItem, index: number, items: PositionedTextItem[]): boolean {
  const nextItem = items[index + 1]

  return (
    item.text === 'G' &&
    item.width <= 8 &&
    item.height <= 9 &&
    !!nextItem &&
    nextItem.text.length > 1 &&
    nextItem.x - (item.x + item.width) <= 6
  )
}

function sanitizeRowItems(items: PositionedTextItem[]): PositionedTextItem[] {
  return items.filter((item, index) => !isDecorativeMarker(item, index, items))
}

function rowToText(row: TextRow): string {
  const items = sanitizeRowItems([...row.items].sort((a, b) => a.x - b.x))
  const pieces: string[] = []
  let previousText = ''
  let previousEndX: number | null = null

  for (const item of items) {
    if (previousEndX !== null && shouldInsertSpace(previousText, item, item.x - previousEndX)) {
      pieces.push(' ')
    }
    pieces.push(item.text)
    previousText = item.text
    previousEndX = item.x + item.width
  }

  return pieces
    .join('')
    .replace(/\s+([,.;:!?%)/\]}])/g, '$1')
    .replace(/([([{/"“‘])\s+/g, '$1')
    .replace(/(?<=\p{L})'(?=\p{Lu})/gu, '\' ')
    .replace(/(?<=\p{L})\s*-\s*(?=\p{L})/gu, '-')
    .replace(/(\d)\.\s+(\d)/g, '$1.$2')
    .trim()
}

function toRowText(items: PositionedTextItem[]): string {
  return rowToText({ y: 0, items })
}

function toTextSegment(items: PositionedTextItem[]): PositionedTextItem {
  const firstItem = items[0]
  const lastItem = items[items.length - 1]

  return {
    x: firstItem.x,
    y: firstItem.y,
    width: (lastItem.x + lastItem.width) - firstItem.x,
    height: Math.max(...items.map(item => item.height)),
    text: toRowText(items),
  }
}

function groupRowSegments(items: PositionedTextItem[]): PositionedTextItem[] {
  const sortedItems = sanitizeRowItems([...items].sort((a, b) => a.x - b.x))
  if (sortedItems.length === 0) {
    return []
  }

  const segments: PositionedTextItem[] = []
  let currentSegment: PositionedTextItem[] = [sortedItems[0]]

  for (const item of sortedItems.slice(1)) {
    const previousItem = currentSegment[currentSegment.length - 1]
    const gap = item.x - (previousItem.x + previousItem.width)

    if (gap <= 12) {
      currentSegment.push(item)
    } else {
      segments.push(toTextSegment(currentSegment))
      currentSegment = [item]
    }
  }

  segments.push(toTextSegment(currentSegment))

  return segments
}

function toLabelValueLine(label: string, value: string): string {
  if (!label) {
    return value
  }
  if (!value) {
    return label.endsWith(':') ? label : `${label}:`
  }
  return label.endsWith(':') ? `${label} ${value}` : `${label}: ${value}`
}

function splitLabelContinuation(label: PositionedTextItem, values: PositionedTextItem[]): {
  labelText: string
  valueItems: PositionedTextItem[]
} {
  if (values.length < 2) {
    return { labelText: label.text, valueItems: values }
  }

  const [firstValue, secondValue] = values
  const firstGap = secondValue.x - (firstValue.x + firstValue.width)

  const looksLikeWrappedLabel =
    firstValue.x <= label.x + 8 &&
    firstValue.text.length <= 24 &&
    /[a-z]/.test(firstValue.text) &&
    !/\d/.test(firstValue.text) &&
    /^[A-Za-z][A-Za-z .,'()/-]*:?$/.test(firstValue.text) &&
    firstGap >= 12

  if (!looksLikeWrappedLabel) {
    return { labelText: label.text, valueItems: values }
  }

  return {
    labelText: `${label.text} ${firstValue.text}`.trim(),
    valueItems: values.slice(1),
  }
}

function hasUniformRowHeights(row: TextRow): boolean {
  const heights = row.items
    .map(item => item.height)
    .filter(height => height > 0)

  if (heights.length === 0) {
    return false
  }

  const minHeight = Math.min(...heights)
  const maxHeight = Math.max(...heights)
  return maxHeight <= minHeight * 1.75
}

function averageRowHeight(row: TextRow): number {
  const heights = row.items
    .map(item => item.height)
    .filter(height => height > 0)

  if (heights.length === 0) {
    return 0
  }

  return heights.reduce((total, height) => total + height, 0) / heights.length
}

function looksLikeFormLabelRow(row: TextRow): boolean {
  if (row.items.length < 2 || row.items.length > 6) {
    return false
  }

  if (!hasUniformRowHeights(row)) {
    return false
  }

  const rowText = rowToText(row)
  if (rowText.length > 120) {
    return false
  }

  const averageItemLength = row.items.reduce((total, item) => total + item.text.length, 0) / row.items.length
  const lowercaseLabels = row.items.filter(item => /[a-z]/.test(item.text)).length

  return averageItemLength <= 24 && lowercaseLabels >= Math.max(1, Math.ceil(row.items.length / 2))
}

function formRowToLines(labelRow: TextRow, valueRow: TextRow): string[] | null {
  const labels = [...labelRow.items].sort((a, b) => a.x - b.x)
  const values = groupRowSegments(valueRow.items)

  if (!looksLikeFormLabelRow(labelRow) || values.length === 0 || values.length > 12) {
    return null
  }

  const verticalGap = labelRow.y - valueRow.y
  if (verticalGap < 6 || verticalGap > 18) {
    return null
  }

  if (averageRowHeight(valueRow) <= averageRowHeight(labelRow) * 1.15) {
    return null
  }

  const columns = labels.map((label, index) => {
    const previousLabel = labels[index - 1]
    const nextLabel = labels[index + 1]
    const startX = previousLabel ? (previousLabel.x + previousLabel.width + label.x) / 2 : Number.NEGATIVE_INFINITY
    const endX = nextLabel ? (label.x + label.width + nextLabel.x) / 2 : Number.POSITIVE_INFINITY
    const columnValues = values.filter(value => {
      const centerX = value.x + value.width / 2
      return centerX >= startX && centerX < endX
    })
    const { labelText, valueItems } = splitLabelContinuation(label, columnValues)
    return {
      label: labelText,
      startX,
      endX,
      value: toRowText(valueItems),
    }
  })

  const populatedColumns = columns.filter(column => column.value)
  if (populatedColumns.length < 2) {
    return null
  }

  const unmatchedValues = values.filter(value => {
    const centerX = value.x + value.width / 2
    return !columns.some(column => centerX >= column.startX && centerX < column.endX)
  })

  if (unmatchedValues.length > Math.max(1, Math.floor(values.length / 3))) {
    return null
  }

  return columns.map(column => toLabelValueLine(column.label, column.value))
}

function rowsToLines(rows: TextRow[]): string[] {
  const lines: string[] = []

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    const nextRow = rows[index + 1]

    if (nextRow) {
      const formLines = formRowToLines(row, nextRow)
      if (formLines) {
        lines.push(...formLines)
        index += 1
        continue
      }
    }

    const line = rowToText(row)
    if (line) {
      lines.push(line)
    }
  }

  return lines
}

function dehyphenateWrappedLines(lines: string[]): string[] {
  const normalized: string[] = []

  for (const line of lines) {
    if (normalized.length === 0) {
      normalized.push(line)
      continue
    }

    const previousLine = normalized[normalized.length - 1]
    if (/[A-Za-z]-$/.test(previousLine) && /^[a-z]/.test(line)) {
      normalized[normalized.length - 1] = previousLine.slice(0, -1) + line
    } else {
      normalized.push(line)
    }
  }

  return normalized
}

export function pageItemsToText(items: Array<PdfTextItem | PdfTextMarkedContent>): string {
  const positionedItems = dedupeOverlappingItems(items
    .filter(isTextItem)
    .map(toPositionedTextItem)
    .filter((item): item is PositionedTextItem => item !== null))

  if (positionedItems.length === 0) {
    return ''
  }

  const lines = rowsToLines(groupRows(positionedItems))
    .filter(Boolean)

  return dehyphenateWrappedLines(lines).join('\n').trim()
}

export async function getPDFRawTextContent(contents: Buffer): Promise<string> {
  const { getDocument } = await loadPdfJsModule()
  const loadingTask = getDocument({
    data: new Uint8Array(contents),
    useWorkerFetch: false,
    isEvalSupported: false,
  })

  try {
    const pdfDocument = await loadingTask.promise
    const pages: string[] = []

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      const page = await pdfDocument.getPage(pageNumber)
      const textContent = await page.getTextContent({ disableNormalization: false })
      const pageText = pageItemsToText(textContent.items)
      if (pageText) {
        pages.push(pageText)
      }
    }

    return pages.join('\n\n').trim()
  } finally {
    await loadingTask.destroy()
  }
}

export async function getOfficeRawTextContent(contents: Buffer): Promise<string> {
  const { parseOfficeAsync } = await loadOfficeParserModule()
  return parseOfficeAsync(contents)
}

export function getExcelRawTextContent(contents: Buffer): Promise<string> {
  try {
    let content = ''
    const workbook = XLSX.read(contents, { type: 'buffer' })
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName]
      const sheet = XLSX.utils.sheet_to_csv(worksheet)
      content += `Sheet: ${sheetName}\n`
      content += csvToMarkdown(sheet, ',').split('\n').map(l => l.trim()).join('\n') + '\n\n'
    }
    return Promise.resolve(content.trim())
  } catch {
    return getOfficeRawTextContent(contents)
  }
}

export function getTextContent(b64contents: string, format: string): Promise<string> {
  switch (format) {
    case 'txt':
      return Promise.resolve(Buffer.from(b64contents, 'base64').toString('utf-8'))
    case 'pdf':
      return getPDFRawTextContent(Buffer.from(b64contents, 'base64'))
    case 'docx':
    case 'pptx':
      return getOfficeRawTextContent(Buffer.from(b64contents, 'base64'))
    case 'xlsx':
      return getExcelRawTextContent(Buffer.from(b64contents, 'base64'))
    default:
      return Promise.resolve(b64contents)
  }
}
