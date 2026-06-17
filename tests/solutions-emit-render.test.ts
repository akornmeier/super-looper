import { afterEach, describe, expect, test } from "bun:test"
import { load } from "js-yaml"
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  BUG_PROBLEM_TYPES,
  KNOWLEDGE_PROBLEM_TYPES,
  COMPONENTS,
  ROOT_CAUSES,
  RESOLUTION_TYPES,
  SEVERITIES,
} from "../src/solutions/schema"
import { CATEGORY_MAP } from "../src/solutions/doc-model"
import { renderYamlSchemaMd, renderSchemaYaml, emitDocs } from "../src/solutions/emit"

const ALL_PROBLEM_TYPES = [...BUG_PROBLEM_TYPES, ...KNOWLEDGE_PROBLEM_TYPES]
const RAILS_VALUES = ["rails_model", "rails_version", "missing_association"]

const DEST_DIRS = [
  "plugins/super-looper/skills/sl-compound/references",
  "plugins/super-looper/skills/sl-compound-refresh/references",
]
const DOC_NAMES = ["yaml-schema.md", "schema.yaml"]

const tempRoots: string[] = []
afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "solutions-emit-"))
  tempRoots.push(root)
  return root
}

describe("renderYamlSchemaMd", () => {
  test("contains every component value, both track rows, and every category-map row", () => {
    const md = renderYamlSchemaMd()
    for (const value of COMPONENTS) expect(md).toContain(value)
    expect(md).toContain("**Bug**")
    expect(md).toContain("**Knowledge**")
    for (const dir of Object.values(CATEGORY_MAP)) expect(md).toContain(dir)
  })

  test("contains no Rails-flavored values", () => {
    const md = renderYamlSchemaMd()
    for (const rails of RAILS_VALUES) expect(md).not.toContain(rails)
  })
})

describe("renderSchemaYaml", () => {
  test("parses back to the expected enum sets", () => {
    const parsed = load(renderSchemaYaml()) as any
    expect(parsed.tracks.bug.problem_types).toEqual([...BUG_PROBLEM_TYPES])
    expect(parsed.tracks.knowledge.problem_types).toEqual([...KNOWLEDGE_PROBLEM_TYPES])
    expect(parsed.required_fields.problem_type.values).toEqual(ALL_PROBLEM_TYPES)
    expect(parsed.required_fields.component.values).toEqual([...COMPONENTS])
    expect(parsed.required_fields.severity.values).toEqual([...SEVERITIES])
    expect(parsed.track_rules.bug.required.root_cause.values).toEqual([...ROOT_CAUSES])
    expect(parsed.track_rules.bug.required.resolution_type.values).toEqual([...RESOLUTION_TYPES])
  })

  test("contains no Rails-flavored values", () => {
    const yaml = renderSchemaYaml()
    for (const rails of RAILS_VALUES) expect(yaml).not.toContain(rails)
  })
})

describe("enum coverage", () => {
  test("every enum value appears in both rendered docs", () => {
    const md = renderYamlSchemaMd()
    const yaml = renderSchemaYaml()
    const allValues = [
      ...COMPONENTS,
      ...ROOT_CAUSES,
      ...RESOLUTION_TYPES,
      ...ALL_PROBLEM_TYPES,
    ]
    for (const value of allValues) {
      expect(md).toContain(value)
      expect(yaml).toContain(value)
    }
  })
})

describe("enum YAML safety", () => {
  test("every enum value is a safe unquoted YAML scalar", () => {
    // The renderer emits enum values unquoted; a value containing a YAML
    // indicator character would produce an invalid generated schema.yaml.
    const safe = /^[a-z][a-z0-9_]*$/
    const allEnums = [
      ...BUG_PROBLEM_TYPES,
      ...KNOWLEDGE_PROBLEM_TYPES,
      ...COMPONENTS,
      ...ROOT_CAUSES,
      ...RESOLUTION_TYPES,
      ...SEVERITIES,
    ]
    for (const value of allEnums) expect(value).toMatch(safe)
  })
})

describe("emitDocs drift mechanics", () => {
  test("reports all changed on a fresh root without writing when write:false", async () => {
    const root = makeRoot()
    const updates = await emitDocs({ root, write: false })
    expect(updates).toHaveLength(DEST_DIRS.length * DOC_NAMES.length)
    expect(updates.every((u) => u.changed)).toBe(true)
    // Pure check mode: nothing written.
    for (const u of updates) expect(existsSync(u.path)).toBe(false)
  })

  test("an in-sync tree reports nothing changed", async () => {
    const root = makeRoot()
    await emitDocs({ root, write: true })
    const updates = await emitDocs({ root, write: false })
    expect(updates.every((u) => !u.changed)).toBe(true)
  })

  test("a single stale doc is the only path reported changed", async () => {
    const root = makeRoot()
    await emitDocs({ root, write: true })
    const stalePath = path.join(root, DEST_DIRS[0], DOC_NAMES[0])
    writeFileSync(stalePath, "stale content\n", "utf8")
    const updates = await emitDocs({ root, write: false })
    const changed = updates.filter((u) => u.changed).map((u) => u.path)
    expect(changed).toEqual([stalePath])
  })
})
