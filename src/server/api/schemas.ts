import { z } from "zod";

export const userNameSchema = z.string();
export const userEmailSchema = z.string().email();
