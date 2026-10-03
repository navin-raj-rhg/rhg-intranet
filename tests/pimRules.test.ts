import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPimCsv, checkPimAttributeValue, describePimChange, normalisePimSuppliers, parsePimCsv,
  pimAttributeDefProblem, pimBarcodeProblem, pimChanges, pimCompleteness, pimCsvTemplate, pimFileProblem,
  pimMoneyProblem, pimNextImageIsMain, pimProductNoKey, pimProductNoProblem, pimQuantityProblem,
  pimSuppliersProblem, readPimImport
} from '../shared/utils/pimRules.ts'

test('product numbers are tidied for comparison and checked', () => {
  assert.equal(pimProductNoKey('  ab   12 '), 'ab 12')
  assert.equal(pimProductNoProblem('  '), 'Product number can\'t be blank')
  assert.match(pimProductNoProblem('x'.repeat(41)), /40 characters/)
  assert.equal(pimProductNoProblem('CL-100'), '')
})

test('barcodes: digits, length and check digit', () => {
  assert.equal(pimBarcodeProblem(''), '')
  assert.equal(pimBarcodeProblem('9300675024235'), '')
  assert.equal(pimBarcodeProblem('93006750 24235'), '')
  assert.equal(pimBarcodeProblem('12345670'), '')
  assert.match(pimBarcodeProblem('9300675024236'), /check digit/)
  assert.match(pimBarcodeProblem('93006'), /8, 12, 13 or 14/)
  assert.match(pimBarcodeProblem('93006750242AB'), /digits only/)
})

test('money and quantity checks', () => {
  assert.equal(pimMoneyProblem('', 'RRP'), '')
  assert.equal(pimMoneyProblem('19.95', 'RRP'), '')
  assert.match(pimMoneyProblem('-1', 'RRP'), /0 or more/)
  assert.match(pimMoneyProblem('1.999', 'RRP'), /2 decimal/)
  assert.equal(pimQuantityProblem('6000', 'Qty'), '')
  assert.match(pimQuantityProblem('0', 'Qty'), /whole number/)
  assert.match(pimQuantityProblem('1.5', 'Qty'), /whole number/)
})

test('suppliers: blanks and repeats removed, exactly one primary', () => {
  const list = normalisePimSuppliers([
    { name: ' ' },
    { name: 'Acme  Co', supplierCode: ' A-1 ' },
    { name: 'acme co' },
    { name: 'Beta', isPrimary: true }
  ])
  assert.deepEqual(list, [
    { name: 'Acme Co', supplierCode: 'A-1', isPrimary: false },
    { name: 'Beta', supplierCode: null, isPrimary: true }
  ])
  assert.equal(normalisePimSuppliers([{ name: 'One' }, { name: 'Two' }])[0]!.isPrimary, true)
  assert.deepEqual(normalisePimSuppliers([]), [])
  const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `S${i}` }))
  assert.match(pimSuppliersProblem(eleven), /at most 10/)
  assert.equal(pimSuppliersProblem(eleven.slice(0, 10)), '')
})

test('attribute definitions', () => {
  assert.equal(pimAttributeDefProblem({ name: 'Material', type: 'text' }), '')
  assert.match(pimAttributeDefProblem({ name: '', type: 'text' }), /can't be blank/)
  assert.match(pimAttributeDefProblem({ name: 'X', type: 'colour' }), /Pick a type/)
  assert.match(pimAttributeDefProblem({ name: 'Finish', type: 'list', options: ['Matt'] }), /at least 2/)
  assert.match(pimAttributeDefProblem({ name: 'Finish', type: 'list', options: ['Matt', 'matt'] }), /different/)
  assert.equal(pimAttributeDefProblem({ name: 'Finish', type: 'list', options: ['Matt', 'Gloss'] }), '')
})

test('attribute values are checked and stored consistently', () => {
  const num = { name: 'Weight', type: 'number' as const }
  assert.deepEqual(checkPimAttributeValue(num, ' 2.50 '), { value: '2.5', problem: '' })
  assert.match(checkPimAttributeValue(num, 'heavy').problem, /must be a number/)
  assert.deepEqual(checkPimAttributeValue(num, ''), { value: null, problem: '' })
  const yn = { name: 'Foldable', type: 'yesno' as const }
  assert.equal(checkPimAttributeValue(yn, true).value, 'yes')
  assert.equal(checkPimAttributeValue(yn, 'N').value, 'no')
  assert.match(checkPimAttributeValue(yn, 'maybe').problem, /Yes or No/)
  const list = { name: 'Finish', type: 'list' as const, options: ['Matt', 'Gloss'] }
  assert.equal(checkPimAttributeValue(list, 'gloss').value, 'Gloss')
  assert.match(checkPimAttributeValue(list, 'Satin').problem, /one of: Matt, Gloss/)
  assert.equal(checkPimAttributeValue({ name: 'Material', type: 'text' }, '  Steel  ').value, 'Steel')
})

test('completeness counts required fields and attributes', () => {
  const none = pimCompleteness({}, [], [])
  assert.deepEqual(none, { filled: 0, total: 0, percent: 100, missing: [] })
  const result = pimCompleteness(
    { shortDescription: 'Clamp', brand: ' ', supplierCount: 2, imageCount: 0, attributeValues: { 1: 'Steel', 2: '' } },
    ['shortDescription', 'brand', 'supplier', 'mainImage', 'supplier'],
    [{ id: 1, name: 'Material' }, { id: 2, name: 'Finish' }]
  )
  assert.equal(result.filled, 3)
  assert.equal(result.total, 6)
  assert.equal(result.percent, 50)
  assert.deepEqual(result.missing, ['Brand', 'Main image', 'Finish'])
})

test('files follow the Projects rules, and images must be images', () => {
  assert.equal(pimFileProblem('front.JPG', 1000, 'image'), '')
  assert.match(pimFileProblem('spec.pdf', 1000, 'image'), /Images must be/)
  assert.equal(pimFileProblem('spec.pdf', 1000, 'document'), '')
  assert.match(pimFileProblem('run.exe', 1000, 'document'), /can't be attached/)
  assert.match(pimFileProblem('big.png', 21 * 1024 * 1024, 'image'), /20 MB/)
  assert.ok(pimNextImageIsMain(0))
  assert.ok(!pimNextImageIsMain(1))
})

test('CSV parsing handles quotes, commas, line breaks and a BOM', () => {
  const rows = parsePimCsv('﻿A,B\r\n"x, y","say ""hi"""\n"line1\nline2",z\n\n')
  assert.deepEqual(rows, [['A', 'B'], ['x, y', 'say "hi"'], ['line1\nline2', 'z']])
})

test('CSV building quotes cells and defuses formulas', () => {
  const csv = buildPimCsv([['A-1', 'Clamp, large', '=SUM(1)', 5, null]], ['a', 'b', 'c', 'd', 'e'])
  assert.equal(csv, 'a,b,c,d,e\r\nA-1,"Clamp, large",\'=SUM(1),5,\r\n')
  assert.equal(parsePimCsv(csv)[1]![1], 'Clamp, large')
  assert.match(buildPimCsv([['-5']], ['n']), /\r\n-5\r\n/)
})

test('import reads good rows', () => {
  const csv = [
    'Product Number,Name,Status,Suppliers,Barcode,RRP,Category,Sub-category',
    'CL-1,Clamp,active,Acme: A-1; Beta,9300675024235,19.95,Tools,Clamps',
    'CL-2,Big clamp,,,,,,'
  ].join('\n')
  const { rows, problems } = readPimImport(csv)
  assert.deepEqual(problems, [])
  assert.equal(rows.length, 2)
  assert.equal(rows[0]!.status, 'active')
  assert.deepEqual(rows[0]!.suppliers, [
    { name: 'Acme', supplierCode: 'A-1', isPrimary: true },
    { name: 'Beta', supplierCode: null, isPrimary: false }
  ])
  assert.equal(rows[0]!.subCategory, 'Clamps')
  assert.equal(rows[1]!.status, 'draft')
  assert.equal(rows[1]!.barcode, null)
})

test('import names every problem with its row and imports nothing', () => {
  const csv = [
    'Product number,Name,Status,Barcode,Sub-category',
    'CL-1,Clamp,live,,',
    'cl-1,Again,,,',
    ',No number,,,',
    'CL-4,Four,,123,Clamps'
  ].join('\n')
  const { rows, problems } = readPimImport(csv)
  assert.equal(rows.length, 0)
  assert.ok(problems.some(p => p.startsWith('Row 2: Status must be')))
  assert.ok(problems.some(p => p.startsWith('Row 3:') && p.includes('also on row 2')))
  assert.ok(problems.some(p => p.startsWith('Row 4: Product number can\'t be blank')))
  assert.ok(problems.some(p => p.startsWith('Row 5:') && p.includes('Barcode must be 8, 12')))
  assert.ok(problems.some(p => p.startsWith('Row 5:') && p.includes('sub-category needs a category')))
})

test('import refuses missing columns, empty files and huge files', () => {
  assert.deepEqual(readPimImport('').problems, ['The file is empty'])
  assert.match(readPimImport('Name\nA').problems[0]!, /"Product number" column/)
  assert.match(readPimImport('Product number,Name').problems[0]!, /no products/)
  assert.match(readPimImport('Product number,Name\nA,B\nC,D', 1).problems[0]!, /at most 1/)
})

test('history lists only what changed', () => {
  const changes = pimChanges({ Name: 'Old', Brand: 'X', RRP: null }, { Name: 'New', Brand: 'X', RRP: 5 })
  assert.deepEqual(changes, [
    { field: 'Name', from: 'Old', to: 'New' },
    { field: 'RRP', from: '', to: '5' }
  ])
  assert.equal(describePimChange(changes[1]!), 'RRP: (blank) → 5')
  assert.ok(describePimChange({ field: 'Long', from: '', to: 'x'.repeat(100) }).endsWith('...'))
})

test('the CSV template reads back as a valid import', () => {
  const { rows, problems } = readPimImport(pimCsvTemplate())
  assert.deepEqual(problems, [])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.suppliers.length, 2)
  assert.equal(rows[0]!.suppliers[0]!.isPrimary, true)
})
