#!/usr/bin/env bun

import { captureCoreLoopBaseline } from "../../src/core-loop/baseline"

const baseline = await captureCoreLoopBaseline()
process.stdout.write(`${JSON.stringify(baseline, null, 2)}\n`)
