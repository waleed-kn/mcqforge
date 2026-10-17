import { z } from "zod";

export const resourceIdSchema = z.string().uuid();
