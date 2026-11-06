/** Downscale an image file so its long edge is at most `maxSide`, returning a JPEG. Respects EXIF rotation. */
export async function resizeImage(file: Blob, maxSide: number, quality = 0.85): Promise<Blob> {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Could not encode the photo"))),
            "image/jpeg",
            quality,
        ),
    );
}

/** The photo sent to the scanner (~1024px, about 1,000 visual tokens) and the thumbnail kept on the device. */
export async function preparePhoto(file: Blob): Promise<{ upload: Blob; thumb: Blob }> {
    const [upload, thumb] = await Promise.all([
        resizeImage(file, 1024, 0.85),
        resizeImage(file, 480, 0.8),
    ]);
    return { upload, thumb };
}
