
import { vi, expect, test } from 'vitest'
import { getTextContent, pageItemsToText } from '@main/text'
import fs from 'fs'

vi.mock('electron', async () => {
  return {
    app: {
      getPath: vi.fn()
    }
  }
})

test('TXT', async () => {
  const contents = fs.readFileSync('./tests/fixtures/sample.txt', 'base64')
  const text = await getTextContent(contents, 'txt')
  expect(text).toContain('Hello from TEXT')
})

test('PDF', async () => {
  const contents = fs.readFileSync('./tests/fixtures/sample.pdf', 'base64')
  const text = await getTextContent(contents, 'pdf')
  expect(text).toContain('Hello from PDF')

  const empty = fs.readFileSync('./tests/fixtures/empty.pdf', 'base64')
  expect(await getTextContent(empty, 'pdf')).toBe('')
})

test('PDF text reconstruction preserves URL fragments and form titles', () => {
  const text = pageItemsToText([
    { str: 'Go to', transform: [1, 0, 0, 1, 0, 100], width: 24, height: 10 },
    { str: 'docs.example.com/Form8879', transform: [1, 0, 0, 1, 30, 100], width: 112, height: 10 },
    { str: 'for the latest information.', transform: [1, 0, 0, 1, 144, 100], width: 110, height: 10 },
    { str: 'Form', transform: [1, 0, 0, 1, 0, 80], width: 24, height: 10 },
    { str: '8879', transform: [1, 0, 0, 1, 25, 80], width: 22, height: 10 },
    { str: 'reference title', transform: [1, 0, 0, 1, 48, 80], width: 76, height: 10 },
  ])

  expect(text).toContain('Go to docs.example.com/Form8879 for the latest information.')
  expect(text).toContain('Form 8879 reference title')
})

test('PDF text reconstruction turns aligned label and value rows into key-value lines', () => {
  const text = pageItemsToText([
    { str: 'Field one', transform: [1, 0, 0, 1, 105, 189], width: 36, height: 6 },
    { str: 'Field two', transform: [1, 0, 0, 1, 239, 189], width: 34, height: 6 },
    { str: 'Field three', transform: [1, 0, 0, 1, 363, 189], width: 40, height: 6 },
    { str: 'Field four', transform: [1, 0, 0, 1, 438, 189], width: 36, height: 6 },
    { str: 'Option:', transform: [1, 0, 0, 1, 512, 189], width: 22, height: 6 },
    { str: 'ALPHA', transform: [1, 0, 0, 1, 111, 177], width: 32, height: 10 },
    { str: 'BETA', transform: [1, 0, 0, 1, 148, 177], width: 28, height: 10 },
    { str: 'GAMMA', transform: [1, 0, 0, 1, 240, 177], width: 36, height: 10 },
    { str: 'DELTA', transform: [1, 0, 0, 1, 281, 177], width: 34, height: 10 },
    { str: 'ID-1234', transform: [1, 0, 0, 1, 435, 177], width: 40, height: 10 },
    { str: 'Enabled', transform: [1, 0, 0, 1, 523, 179], width: 28, height: 6 },
  ])

  expect(text).toContain('Field one: ALPHA BETA')
  expect(text).toContain('Field two: GAMMA DELTA')
  expect(text).toContain('Field three:')
  expect(text).toContain('Field four: ID-1234')
  expect(text).toContain('Option: Enabled')
})

test('PDF text reconstruction merges wrapped label fragments before pairing values', () => {
  const text = pageItemsToText([
    { str: 'Label', transform: [1, 0, 0, 1, 106, 284], width: 20, height: 6 },
    { str: 'name', transform: [1, 0, 0, 1, 106, 278], width: 16, height: 6 },
    { str: 'VALUE', transform: [1, 0, 0, 1, 146, 276], width: 34, height: 10 },
    { str: 'ONE', transform: [1, 0, 0, 1, 186, 276], width: 22, height: 10 },
    { str: 'Field', transform: [1, 0, 0, 1, 360, 284], width: 18, height: 6 },
    { str: 'no.', transform: [1, 0, 0, 1, 360, 278], width: 9, height: 6 },
    { str: '(111)', transform: [1, 0, 0, 1, 388, 276], width: 28, height: 10 },
    { str: '222-3333', transform: [1, 0, 0, 1, 422, 276], width: 42, height: 10 },
  ])

  expect(text).toContain('Label name: VALUE ONE')
  expect(text).toContain('Field no.: (111) 222-3333')
})

test('PDF text reconstruction merges multi-word wrapped label fragments', () => {
  const text = pageItemsToText([
    { str: 'Group', transform: [1, 0, 0, 1, 100, 200], width: 18, height: 6 },
    { str: 'detail (PIN)', transform: [1, 0, 0, 1, 100, 194], width: 40, height: 6 },
    { str: '77777', transform: [1, 0, 0, 1, 180, 192], width: 28, height: 10 },
    { str: 'Field', transform: [1, 0, 0, 1, 320, 200], width: 18, height: 6 },
    { str: 'name', transform: [1, 0, 0, 1, 320, 194], width: 18, height: 6 },
    { str: 'VALUE', transform: [1, 0, 0, 1, 390, 192], width: 36, height: 10 },
  ])

  expect(text).toContain('Group detail (PIN): 77777')
  expect(text).toContain('Field name: VALUE')
})

test('PDF text reconstruction ignores non-uniform header rows', () => {
  const text = pageItemsToText([
    { str: 'Section label', transform: [1, 0, 0, 1, 0, 100], width: 46, height: 8 },
    { str: 'X', transform: [1, 0, 0, 1, 80, 98], width: 10, height: 18 },
    { str: 'Person label', transform: [1, 0, 0, 1, 0, 84], width: 42, height: 6 },
    { str: 'ID label', transform: [1, 0, 0, 1, 90, 84], width: 28, height: 6 },
    { str: 'ALPHA', transform: [1, 0, 0, 1, 0, 68], width: 32, height: 10 },
    { str: 'BETA', transform: [1, 0, 0, 1, 38, 68], width: 28, height: 10 },
    { str: 'ID-1234', transform: [1, 0, 0, 1, 90, 68], width: 40, height: 10 },
  ])

  expect(text).toContain('Section label X')
  expect(text).not.toContain('Section label:')
  expect(text).toContain('Person label: ALPHA BETA')
  expect(text).toContain('ID label: ID-1234')
})

test('PDF text reconstruction ignores same-height prose rows', () => {
  const text = pageItemsToText([
    { str: 'Notice text', transform: [1, 0, 0, 1, 0, 100], width: 40, height: 8 },
    { str: 'G', transform: [1, 0, 0, 1, 114, 100], width: 6.8, height: 8 },
    { str: 'Go to', transform: [1, 0, 0, 1, 120, 100], width: 22, height: 8 },
    { str: 'example.com/form', transform: [1, 0, 0, 1, 120, 88], width: 70, height: 8 },
    { str: 'for details.', transform: [1, 0, 0, 1, 194, 88], width: 44, height: 8 },
  ])

  expect(text).toContain('Notice text Go to')
  expect(text).toContain('example.com/form for details.')
  expect(text).not.toContain('G:')
  expect(text).not.toContain('Notice text:')
})

test('Word', async () => {
  const contents = fs.readFileSync('./tests/fixtures/sample.docx', 'base64')
  const text = await getTextContent(contents, 'docx')
  expect(text).toContain('Hello from Word')
})

test('PowerPoint', async () => {
  const contents = fs.readFileSync('./tests/fixtures/sample.pptx', 'base64')
  const text = await getTextContent(contents, 'pptx')
  expect(text).toContain('Hello from PowerPoint')
})

test('Excel', async () => {
  const contents = fs.readFileSync('./tests/fixtures/sample.xlsx', 'base64')
  const text = await getTextContent(contents, 'xlsx')
  expect(text).toBe(`Sheet: Sheet 1
|                  |
|------------------|
| Hello from Excel |


Sheet: Sheet2
|           |        |       |
|-----------|--------|-------|
| Bye       | from   | Excel |
| Au-revoir | depuis | Excel |`)
})
