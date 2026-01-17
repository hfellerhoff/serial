import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "~/env";
import { isServerAuthed } from ".";

export const fetchIsForgotPasswordEnabled = createServerFn({
  method: "GET",
}).handler(async () => !!env.SENDGRID_API_KEY);

export const fetchIsAuthed = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();
    return isServerAuthed(request.headers);
  },
);
