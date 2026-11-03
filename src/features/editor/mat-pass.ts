/**
 * MAT's image passes — the captured view flattened for display, and the
 * preview built from it. The capture itself is the viewport's own
 * (CameraHandle.capture in SceneCanvas): the world as the user sees it, with
 * the editor's aids stood down for the shutter.
 */

/* ------------------------------------------------------------ the pass -- */

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });

/** The canvas the editor draws on — what shows through a transparent sky. */
const BACKDROP = "#15110e";

/**
 * The capture as a flat image on the editor's own backdrop — what the source
 * slot and the source dialog show.
 */
export async function flatten(src: string) {
  const im = await loadImage(src);
  const c = document.createElement("canvas");
  c.width = im.width;
  c.height = im.height;
  const x = c.getContext("2d")!;
  x.fillStyle = BACKDROP;
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(im, 0, 0);
  return c.toDataURL("image/jpeg", 0.92);
}

/**
 * THE PREVIEW. A stand-in for the MAT service, which this prototype has no
 * connection to: a photographic treatment applied to the captured frame in the
 * browser, so the preview is the user's actual view rather than a stock image.
 * The real pass is a learned domain adaptation; this is a grade, and the
 * history card says "Preview".
 *
 *   MAT        a filmic grade — lifted blacks, rolled highlights, a touch of
 *              warmth and saturation — and lens softness at the edges
 *   + post     bloom on the highlights, chromatic fringing, vignette, grain
 */
export async function matPass(src: string, post: boolean) {
  const im = await loadImage(src);
  const w = im.width, h = im.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;

  // grade
  x.filter = "contrast(1.08) saturate(1.12) brightness(1.03) sepia(0.08)";
  x.drawImage(im, 0, 0);
  x.filter = "none";

  // edge softness: a blurred copy, masked in from the corners
  const soft = document.createElement("canvas");
  soft.width = w;
  soft.height = h;
  const s = soft.getContext("2d")!;
  s.filter = `blur(${Math.max(1, Math.round(w / 900))}px)`;
  s.drawImage(c, 0, 0);
  s.filter = "none";
  s.globalCompositeOperation = "destination-in";
  const edge = s.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(0,0,0,1)");
  s.fillStyle = edge;
  s.fillRect(0, 0, w, h);
  x.drawImage(soft, 0, 0);

  if (post) {
    // bloom: the bright end, blurred wide, screened back over
    const glow = document.createElement("canvas");
    glow.width = w;
    glow.height = h;
    const g = glow.getContext("2d")!;
    g.filter = `brightness(1.6) contrast(2.4) blur(${Math.round(w / 90)}px)`;
    g.drawImage(c, 0, 0);
    x.globalCompositeOperation = "screen";
    x.globalAlpha = 0.22;
    x.drawImage(glow, 0, 0);
    // chromatic fringing: red and blue a pixel or two apart
    const shift = Math.max(1, Math.round(w / 1100));
    x.globalCompositeOperation = "lighter";
    x.globalAlpha = 0.07;
    x.filter = "sepia(1) saturate(6) hue-rotate(-50deg)";
    x.drawImage(c, shift, 0);
    x.filter = "sepia(1) saturate(6) hue-rotate(170deg)";
    x.drawImage(c, -shift, 0);
    x.filter = "none";
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    // vignette
    const v = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.42)");
    x.fillStyle = v;
    x.fillRect(0, 0, w, h);
    // grain
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    let seed = 1337;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const n = ((seed / 0x7fffffff) - 0.5) * 16;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    x.putImageData(img, 0, 0);
  }
  return c.toDataURL("image/jpeg", 0.9);
}
