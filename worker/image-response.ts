import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  handleImageOptimization,
  isImageOptimizationPath,
} from "vinext/server/image-optimization";

export interface ImageEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

// Match the current next/image path and Vinext's legacy alias in the worker.
// Only the local ASSETS binding can supply a source; there is no network fetch.
export function imageResponse(request: Request, env: ImageEnv): Promise<Response> | null {
  if (!isImageOptimizationPath(new URL(request.url).pathname)) return null;

  return handleImageOptimization(request, {
    fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
    transformImage: env.IMAGES ? async (body, { width, format, quality }) => {
      const result = await env.IMAGES!.input(body)
        .transform(width > 0 ? { width } : {}).output({ format, quality });
      return result.response();
    } : undefined,
  }, [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES]);
}
