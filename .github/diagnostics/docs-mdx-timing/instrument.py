from pathlib import Path
import hashlib,json,sys

ORIGINAL_LF_SHA256='f56fe7381131c5d2c6eb9b03a96928d19dd9040f361c2938a2d97ec936e6ec2e'
def digest(raw):return hashlib.sha256(raw).hexdigest()
def instrument(raw):
 eol=b'\r\n' if b'\r\n' in raw else b'\n'
 def text(s):return s.encode().replace(b'\n',eol)
 edits=[
 ("import {describe, expect, mock, test} from 'bun:test';","import {describe, expect, mock, test} from 'bun:test';\nimport {recordMdxTiming} from './mdx-timing.observer';"),
 ("\t\t// Use the same MDX compiler as Docusaurus.","\t\trecordMdxTiming('require-start');\n\t\tconst requireStart = performance.now();\n\t\t// Use the same MDX compiler as Docusaurus."),
 ("\t\tconst {evaluate} = requireFromMdxLoader('@mdx-js/mdx');","\t\tconst {evaluate} = requireFromMdxLoader('@mdx-js/mdx');\n\t\trecordMdxTiming('require-end', undefined, performance.now() - requireStart);"),
 ("\t\t\tconst {default: Page} = await evaluate(source, {","\t\t\trecordMdxTiming('evaluate-start', element.name);\n\t\t\tconst evaluateStart = performance.now();\n\t\t\tconst {default: Page} = await evaluate(source, {"),
 ("\t\t\t\tbaseUrl: pathToFileURL(element.mdxPath),\n\t\t\t});\n\t\t\tconst markup = renderToStaticMarkup(","\t\t\t\tbaseUrl: pathToFileURL(element.mdxPath),\n\t\t\t});\n\t\t\trecordMdxTiming('evaluate-end', element.name, performance.now() - evaluateStart);\n\t\t\tconst renderStart = performance.now();\n\t\t\tconst markup = renderToStaticMarkup("),
 ("\t\t\texpect(markup).toContain(getElementDefinition(element.name).displayName);","\t\t\trecordMdxTiming('render-end', element.name, performance.now() - renderStart);\n\t\t\texpect(markup).toContain(getElementDefinition(element.name).displayName);")
 ]
 output=raw
 for old,new in edits:
  old=text(old);new=text(new)
  assert output.count(old)==1,old
  output=output.replace(old,new)
 assert output.count(b'expect(')==raw.count(b'expect(')
 assert output.count(b'test(')==raw.count(b'test(')
 return output
HELPER_TEMPLATE="""import {appendFileSync} from 'fs';

const outputPath = __OUTPUT_PATH__;
let sequence = 0;
export const recordMdxTiming = (
 event: string,
 page?: string,
 duration?: number,
) => {
 appendFileSync(outputPath, JSON.stringify({
  sequence: sequence++, event, page, duration, at: performance.now(),
 }) + '\\n');
};
"""
def make_helper(output_path):
 return HELPER_TEMPLATE.replace('__OUTPUT_PATH__',json.dumps(str(output_path))).encode()
if '--self-test' in sys.argv:
 original=Path(__file__).with_name('elements-original.test.ts').read_bytes()
 assert digest(original.replace(b'\r\n',b'\n'))==ORIGINAL_LF_SHA256
 for newline in [b'\n',b'\r\n']:
  sample=original.replace(b'\r\n',b'\n').replace(b'\n',newline)
  patched=instrument(sample)
  assert patched.count(b'await evaluate(source, {')==1
  assert patched.index(b"recordMdxTiming('require-start')")<patched.index(b'const requireStart')
  assert patched.index(b"recordMdxTiming('evaluate-start'")<patched.index(b'const evaluateStart')
  if newline==b'\r\n':assert b'\n' not in patched.replace(b'\r\n',b'')
 helper=make_helper(Path('C:/diagnostic/mdx-timing.jsonl'))
 assert b'process.env' not in helper
 print('LF/CRLF strict-apply and post-start-I/O timers pass; test/assertion counts unchanged; no environment output path')
else:
 assert len(sys.argv)>=3,'Expected SOURCE OUTPUT_JSONL [--restore]'
 source=Path(sys.argv[1]);output_path=Path(sys.argv[2]).resolve()
 target=source/'packages/docs/src/test/elements.test.ts'
 helper_path=target.parent/'mdx-timing.observer.ts'
 state_path=output_path.parent/'observer-state.json'
 backup=output_path.parent/'elements-original.test.ts'
 if '--restore' in sys.argv:
  state=json.loads(state_path.read_text())
  assert digest(target.read_bytes())==state['instrumentedSha256'],'Instrumented test changed unexpectedly'
  assert digest(helper_path.read_bytes())==state['observerSha256'],'Observer changed unexpectedly'
  original=backup.read_bytes()
  assert digest(original)==state['originalSha256']
  target.write_bytes(original);helper_path.unlink()
  report={'restored':digest(target.read_bytes())==state['originalSha256'],'observerRemoved':not helper_path.exists(),'originalSha256':state['originalSha256']}
  (output_path.parent/'restoration.json').write_text(json.dumps(report,indent=2))
  print(json.dumps(report))
 else:
  raw=target.read_bytes()
  assert digest(raw.replace(b'\r\n',b'\n'))==ORIGINAL_LF_SHA256,'Unexpected original test source'
  assert not backup.exists() and not helper_path.exists() and not state_path.exists()
  output_path.parent.mkdir(parents=True,exist_ok=True)
  patched=instrument(raw);helper=make_helper(output_path)
  backup.write_bytes(raw);target.write_bytes(patched);helper_path.write_bytes(helper)
  state={'originalSha256':digest(raw),'originalNormalizedSha256':ORIGINAL_LF_SHA256,'instrumentedSha256':digest(patched),'observerSha256':digest(helper),'instrumenterSha256':digest(Path(__file__).read_bytes()),'testAssertionsUnchanged':True}
  state_path.write_text(json.dumps(state,indent=2));print(json.dumps(state))
