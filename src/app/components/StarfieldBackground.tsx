import { useEffect, useRef } from 'react';

export function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const contextResult = canvasElement.getContext('2d');
    if (!contextResult) return;
    const canvas: HTMLCanvasElement = canvasElement;
    const context: CanvasRenderingContext2D = contextResult;

    interface Star {
      x: number;
      y: number;
      z: number;
      size: number;
      speed: number;
      orange: boolean;
      phase: number;
    }

    const stars: Star[] = [];
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const maxDepth = 1600;
    const minDepth = 10;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let focalLength = 620;
    let lastFrame = performance.now();
    let frame = 0;

    function resetStar(star: Star, scatter: boolean) {
      const spread = Math.max(width, height, 900);
      star.x = (Math.random() - 0.5) * spread * 2.3;
      star.y = (Math.random() - 0.5) * spread * 1.55;
      star.z = scatter ? 70 + Math.random() * maxDepth : maxDepth;
      star.size = 0.5 + Math.random() * 1.6;
      star.speed = 0.16 + Math.random() * 0.32;
      star.orange = Math.random() > 0.66;
      star.phase = Math.random() * Math.PI * 2;
    }

    function createStar(scatter: boolean): Star {
      const star: Star = { x: 0, y: 0, z: 0, size: 0, speed: 0, orange: false, phase: 0 };
      resetStar(star, scatter);
      return star;
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      focalLength = Math.min(width, height) * 0.9;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const targetCount = Math.min(900, Math.max(420, Math.floor((width * height) / 2300)));
      while (stars.length < targetCount) stars.push(createStar(true));
      if (stars.length > targetCount) stars.length = targetCount;
    }

    function draw(now: number) {
      const delta = Math.min(2.2, Math.max(0.65, (now - lastFrame) / 16.67));
      lastFrame = now;
      pointer.x += (pointer.targetX - pointer.x) * 0.024;
      pointer.y += (pointer.targetY - pointer.y) * 0.024;
      context.clearRect(0, 0, width, height);

      for (const star of stars) {
        star.z -= (0.42 + 2.65 * star.speed) * delta;
        const depth = Math.max(minDepth, star.z);
        const perspective = focalLength / depth;
        const x = width / 2 + pointer.x * 44 + star.x * perspective;
        const y = height / 2 + pointer.y * 32 + star.y * perspective;

        if (star.z <= minDepth || x < -180 || x > width + 180 || y < -180 || y > height + 180) {
          resetStar(star, false);
          continue;
        }

        const closeness = 1 - star.z / maxDepth;
        const color = star.orange ? '251,160,38' : '255,255,255';
        const twinkle = 0.78 + Math.sin(now * 0.003 + star.phase) * 0.2;
        const alpha = Math.min(0.96, 0.16 + closeness * 1.08) * twinkle;
        const radius = Math.max(0.45, star.size * (0.52 + closeness * 3.2));

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${color}, ${alpha})`;
        context.fill();

        if (closeness > 0.72) {
          context.beginPath();
          context.arc(x, y, radius * 3.4, 0, Math.PI * 2);
          context.fillStyle = `rgba(${color}, ${alpha * 0.08})`;
          context.fill();
        }
      }

      frame = requestAnimationFrame(draw);
    }

    function handlePointerMove(event: PointerEvent) {
      pointer.targetX = (event.clientX / Math.max(width, 1) - 0.5) * 2;
      pointer.targetY = (event.clientY / Math.max(height, 1) - 0.5) * 2;
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  return (
    <div className="starfield" aria-hidden="true">
      <div className="starfield-base" />
      <canvas ref={canvasRef} />
      <div className="starfield-vignette" />
    </div>
  );
}
