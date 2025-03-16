import { Jimp } from "jimp";
import { DatabaseFeedItem } from "./db/schema";

const WIDTH = 480;
const HEIGHT = 360;

const WIDTH_MID = WIDTH / 2;
const HEIGHT_MID = HEIGHT / 2;

function isBlackPixel(value: number) {
  return value === 255;
}

export async function checkFeedItemIsVerticalFromThumbnail(
  thumbnail?: string,
  retries = 0,
): Promise<DatabaseFeedItem["orientation"]> {
  if (!thumbnail) return null;

  try {
    const image = await Jimp.read(thumbnail);

    const hasBlackBar =
      isBlackPixel(image.getPixelColor(0, 0)) &&
      isBlackPixel(image.getPixelColor(0, 20)) &&
      isBlackPixel(image.getPixelColor(20, 20)) &&
      isBlackPixel(image.getPixelColor(0, 20)) &&
      //
      isBlackPixel(image.getPixelColor(WIDTH - 1, 0)) &&
      isBlackPixel(image.getPixelColor(WIDTH - 20, 0)) &&
      isBlackPixel(image.getPixelColor(WIDTH - 20, 20)) &&
      isBlackPixel(image.getPixelColor(WIDTH - 1, 20)) &&
      //
      isBlackPixel(image.getPixelColor(WIDTH - 1, HEIGHT - 1)) &&
      isBlackPixel(image.getPixelColor(WIDTH - 20, HEIGHT - 1)) &&
      isBlackPixel(image.getPixelColor(WIDTH - 20, HEIGHT - 20)) &&
      isBlackPixel(image.getPixelColor(WIDTH - 1, HEIGHT - 20)) &&
      //
      isBlackPixel(image.getPixelColor(0, HEIGHT - 1)) &&
      isBlackPixel(image.getPixelColor(20, HEIGHT - 1)) &&
      isBlackPixel(image.getPixelColor(20, HEIGHT - 20)) &&
      isBlackPixel(image.getPixelColor(0, HEIGHT - 20));

    if (hasBlackBar) {
      return "horizontal";
    }

    return "vertical";
  } catch (err) {
    if (retries < 3) {
      return checkFeedItemIsVerticalFromThumbnail(thumbnail, retries + 1);
    }
    return null;
  }
}
