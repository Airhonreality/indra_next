import { Inngest } from "inngest";

/**
 * INNGEST CLIENT
 * The "Peristaltic Motor" of Indra NEXT.
 * Handles durable workflows, retries, and background orchestration.
 */
export const inngest = new Inngest({ id: "indra-next-sovereign" });
