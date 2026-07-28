import * as BunnySDK from "@bunny.net/edgescript-sdk";
import { handleOriginRequest } from "./middleware";

BunnySDK.net.http
  .servePullZone({ url: "https://www.serial.tube" })
  .onOriginRequest(({ request }): Promise<Request> | Promise<Response> => {
    const result = handleOriginRequest(request);
    if (result instanceof Response) return Promise.resolve(result);
    return Promise.resolve(result);
  });
