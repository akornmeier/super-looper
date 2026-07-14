import { z } from "zod"
import { profileNameSchema } from "../profiles"

const evidenceSchema = z
  .object({
    summary: z.string().min(1),
    path: z.string().min(1).nullable(),
  })
  .strict()

export const reviewPacketSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().min(1),
    status: z.literal("review_ready"),
    intent: z.object({ goal: z.string().min(1), requirements: z.array(z.string().min(1)) }).strict(),
    scope: z
      .object({
        changed_files: z.array(z.string().min(1)),
        diff_summary: z.string(),
      })
      .strict(),
    deterministic_checks: z.array(evidenceSchema),
    semantic_verification: z.array(evidenceSchema),
    failed_attempts: z.array(evidenceSchema),
    unresolved_risks: z.array(z.string().min(1)),
    workflow_profile: profileNameSchema,
    route_rationale: z.string().min(1),
    authority: z
      .object({
        proposal_approved: z.boolean(),
        delivery_authorized: z.literal(false),
        final_engineer_approval_required: z.literal(true),
      })
      .strict(),
    proposed_delivery: z
      .object({
        action: z.enum(["commit", "commit-push-pr"]),
        commit_message: z.string().min(1),
        pr_title: z.string().min(1),
        pr_body_path: z.string().min(1),
      })
      .strict(),
    generated_at: z.string().datetime(),
  })
  .strict()

export type ReviewPacket = z.infer<typeof reviewPacketSchema>
