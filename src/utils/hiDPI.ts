export function fitHiDPI(canvas: HTMLCanvasElement, cssW: number, cssH: number) {
const dpr = Math.max(1, window.devicePixelRatio || 1);
if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
canvas.width = Math.round(cssW * dpr);
canvas.height = Math.round(cssH * dpr);
}
const ctx = canvas.getContext('2d')!;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
return { ctx, dpr };
}