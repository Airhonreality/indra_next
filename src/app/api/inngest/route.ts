export const dynamic = 'force-dynamic';
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { runAgnosticPipeline } from "@/inngest/functions/run-agnostic-pipeline";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAgnosticPipeline],
});
