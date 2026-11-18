import { z } from "zod";

export const bookingSchema = z.object({
  serviceId: z.string().min(1, "Service is required"),
  eventDate: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
    message: "Event date must be in the future",
  }),
  eventLocation: z.string().trim().min(2, "Event location is required"),
  message: z.string().trim().max(1000).optional().default(""),
});