/**
 * Phase 1.5 offline Prefill POC tests (run with: npx ts-node or node after tsc).
 * Fixture HTML mirrors published FB_PUBLIC_LOAD_DATA_ shape (Architecture Decision §4).
 */

import {
  buildDatePrefillParams,
  buildPrefillUrl,
  classifyFbType,
  extractPrefillEntries,
  fbTypeLabel,
} from './prefillEntryExtractor'

/** Synthetic viewform snippet with short/paragraph/MC/dropdown/checkbox/date + file upload. */
const FIXTURE_HTML = `<!DOCTYPE html><html><body><script>
var FB_PUBLIC_LOAD_DATA_ = [null,["desc",[[100,"Short text Q",null,0,[[111111111,null,0]]],[200,"Paragraph Q",null,1,[[222222222,null,1]]],[300,"MC Q",null,2,[[333333333,[["Opt A",null,null,null,0],["Opt B",null,null,null,0]],1]]],[400,"Dropdown Q",null,3,[[444444444,[["Red",null,null,null,0],["Blue",null,null,null,0]],1]]],[500,"Checkbox Q",null,4,[[555555555,[["One",null,null,null,0],["Two",null,null,null,0]],1]]],[600,"Date Q",null,9,[[666666666,null,1]]],[700,"File Q",null,13,[[777777777,null,0]]]],null,null,null,[0,0],null,null,"POC Form",48],"title"];
</script></body></html>`

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

export function runPrefillExtractorTests(): void {
  const bindings = extractPrefillEntries(FIXTURE_HTML)
  assert(bindings.length === 7, `expected 7 bindings, got ${bindings.length}`)

  const byItem = Object.fromEntries(bindings.map((b) => [b.itemId, b]))
  assert(byItem['100']?.entryId === '111111111', 'short entry')
  assert(byItem['200']?.entryId === '222222222', 'paragraph entry')
  assert(byItem['300']?.entryId === '333333333', 'mc entry')
  assert(byItem['400']?.entryId === '444444444', 'dropdown entry')
  assert(byItem['500']?.entryId === '555555555', 'checkbox entry')
  assert(byItem['600']?.entryId === '666666666', 'date entry')
  assert(byItem['700']?.entryId === '777777777', 'file entry')

  assert(classifyFbType(0) === 'SUPPORTED', 'short supported')
  assert(classifyFbType(1) === 'SUPPORTED', 'paragraph supported')
  assert(classifyFbType(2) === 'SUPPORTED', 'mc supported')
  assert(classifyFbType(3) === 'SUPPORTED', 'dropdown supported')
  assert(classifyFbType(4) === 'SUPPORTED', 'checkbox supported')
  assert(classifyFbType(9) === 'SUPPORTED', 'date supported')
  assert(classifyFbType(13) === 'UNSUPPORTED', 'file unsupported')
  assert(fbTypeLabel(13) === 'FILE_UPLOAD', 'file label')

  // Parse failure must throw — callers must not build fake URLs
  let threw = false
  try {
    extractPrefillEntries('<html>no payload</html>')
  } catch {
    threw = true
  }
  assert(threw, 'missing FB_PUBLIC_LOAD_DATA_ must throw')

  const url = buildPrefillUrl(
    'https://docs.google.com/forms/d/e/PUBLIC/viewform?usp=sf_link',
    [
      { entryId: '111111111', value: 'hello' },
      { entryId: '333333333', value: 'Opt A' },
    ]
  )
  assert(url.includes('usp=pp_url'), 'usp=pp_url')
  assert(url.includes('entry.111111111=hello'), 'short param')
  assert(url.includes('entry.333333333=Opt'), 'mc param')
  assert(!url.includes('usp=sf_link'), 'query stripped from base')

  const dateParams = buildDatePrefillParams('666666666', '2026-07-31')
  assert(dateParams.length === 3, 'date has 3 params')
  assert(dateParams[0].entryId === '666666666_year', 'year key')
  assert(dateParams[0].value === '2026', 'year value')
  assert(dateParams[1].value === '7', 'month unpadded')
  assert(dateParams[2].value === '31', 'day')

  console.log('prefillEntryExtractor tests: PASS (8 checks groups)')
}

if (require.main === module) {
  runPrefillExtractorTests()
}
