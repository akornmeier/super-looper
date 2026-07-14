#!/usr/bin/env bun

import { captureStructuralComparison } from "../../src/core-loop/promotion"

process.stdout.write(`${JSON.stringify(await captureStructuralComparison(), null, 2)}\n`)
