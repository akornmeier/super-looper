#!/usr/bin/env bun

import { readFile } from "node:fs/promises"
import {
  executionPlanSchema,
  phasePacketSchema,
  runStateSchema,
  workerResultSchema,
} from "../../src/core-loop/contracts"
import {
  agentResultSchema,
  verifierResultSchema,
  workflowStateSchema,
} from "../../src/workflows/contracts"

const schemas = {
  plan: executionPlanSchema,
  "run-state": runStateSchema,
  "phase-packet": phasePacketSchema,
  "worker-result": workerResultSchema,
  "agent-result": agentResultSchema,
  "verifier-result": verifierResultSchema,
  "workflow-state": workflowStateSchema,
} as const

type ContractName = keyof typeof schemas

function usage(): never {
  process.stderr.write(
    "Usage: bun run scripts/core-loop/validate-contract.ts <plan|run-state|phase-packet|worker-result|agent-result|verifier-result|workflow-state> <json-file>\n",
  )
  process.exit(2)
}

const [contractName, filePath, ...extra] = process.argv.slice(2)
if (!contractName || !filePath || extra.length > 0 || !(contractName in schemas)) usage()

let value: unknown
try {
  value = JSON.parse(await readFile(filePath, "utf8"))
} catch (error) {
  process.stderr.write(`Unable to read JSON contract file: ${(error as Error).message}\n`)
  process.exit(2)
}

const result = schemas[contractName as ContractName].safeParse(value)
if (!result.success) {
  process.stderr.write(`${JSON.stringify(result.error.issues, null, 2)}\n`)
  process.exit(1)
}

process.stdout.write(`${contractName}: valid\n`)
