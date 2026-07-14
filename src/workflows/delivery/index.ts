import { z } from "zod"

export const deliveryPacketSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().min(1),
    authorized_by: z.string().min(1),
    review_decision_path: z.string().min(1),
    action: z.enum(["commit", "commit-push-pr"]),
    changed_files: z.array(z.string().min(1)),
    commit_message: z.string().min(1),
    pr_title: z.string().min(1),
    pr_body_path: z.string().min(1),
  })
  .strict()

export const ciDispositionSchema = z
  .object({
    schema_version: z.literal(1),
    run_id: z.string().min(1),
    disposition: z.enum(["passed", "failed", "pending"]),
    checks: z.array(
      z
        .object({
          name: z.string().min(1),
          bucket: z.string().min(1),
          state: z.string().min(1),
          link: z.string().nullable(),
        })
        .strict(),
    ),
    observed_at: z.string().datetime(),
  })
  .strict()

export type DeliveryPacket = z.infer<typeof deliveryPacketSchema>
export type CiDisposition = z.infer<typeof ciDispositionSchema>
