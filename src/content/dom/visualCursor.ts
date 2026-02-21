type Point = {
  x: number;
  y: number;
};

const CURSOR_ID = "nwa-visual-cursor";
const RIPPLE_ID = "nwa-visual-cursor-ripple";

class VisualCursor {
  private readonly cursor: HTMLDivElement;
  private readonly ripple: HTMLDivElement;
  private currentPoint: Point | null = null;
  private motionChain: Promise<void> = Promise.resolve();

  constructor() {
    this.cursor = document.createElement("div");
    this.cursor.id = CURSOR_ID;
    this.cursor.className = "nwa-visual-cursor";

    this.ripple = document.createElement("div");
    this.ripple.id = RIPPLE_ID;
    this.ripple.className = "nwa-visual-ripple";

    this.ensureAttached();
  }

  moveToElement(element: Element): Promise<void> {
    const target = this.resolveElementCenter(element);
    if (!target) {
      return Promise.resolve();
    }

    const start = this.currentPoint ?? this.getViewportAnchor(target);
    const distance = Math.hypot(target.x - start.x, target.y - start.y);
    const durationMs = clamp(Math.round(distance / 7), 80, 180);

    this.motionChain = this.motionChain.then(() => this.animateQuadraticPath(start, target, durationMs));
    return this.motionChain;
  }

  async pulse(): Promise<void> {
    this.ensureAttached();
    this.cursor.classList.add("nwa-visual-cursor-active");
    this.ripple.classList.remove("nwa-visual-ripple-animate");
    void this.ripple.offsetWidth;
    this.ripple.classList.add("nwa-visual-ripple-animate");
    await sleep(55);
    this.cursor.classList.remove("nwa-visual-cursor-active");
  }

  private ensureAttached(): void {
    const root = document.documentElement;
    if (!root.contains(this.cursor)) {
      root.appendChild(this.cursor);
    }

    if (!root.contains(this.ripple)) {
      root.appendChild(this.ripple);
    }
  }

  private resolveElementCenter(element: Element): Point | null {
    const rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      return null;
    }

    const jitterX = randomBetween(-3, 3);
    const jitterY = randomBetween(-2, 2);

    return {
      x: rect.left + rect.width / 2 + jitterX,
      y: rect.top + rect.height / 2 + jitterY
    };
  }

  private getViewportAnchor(target: Point): Point {
    return {
      x: clamp(target.x + randomBetween(-120, -70), 12, window.innerWidth - 12),
      y: clamp(target.y + randomBetween(45, 90), 12, window.innerHeight - 12)
    };
  }

  private async animateQuadraticPath(start: Point, target: Point, durationMs: number): Promise<void> {
    this.ensureAttached();

    const control = computeControlPoint(start, target);
    const startedAt = performance.now();

    await new Promise<void>((resolve) => {
      const tick = (now: number): void => {
        const elapsed = now - startedAt;
        const t = clamp(elapsed / durationMs, 0, 1);
        const eased = easeOutCubic(t);

        const x = quadraticPoint(start.x, control.x, target.x, eased);
        const y = quadraticPoint(start.y, control.y, target.y, eased);

        this.setPoint({ x, y });

        if (t < 1) {
          requestAnimationFrame(tick);
          return;
        }

        this.currentPoint = target;
        resolve();
      };

      requestAnimationFrame(tick);
    });
  }

  private setPoint(point: Point): void {
    this.cursor.style.transform = `translate(${point.x}px, ${point.y}px)`;
    this.ripple.style.setProperty("--nwa-ripple-x", `${point.x}px`);
    this.ripple.style.setProperty("--nwa-ripple-y", `${point.y}px`);
    this.ripple.style.transform = `translate(${point.x}px, ${point.y}px)`;
    this.currentPoint = point;
  }
}

let singletonCursor: VisualCursor | null = null;

export function getVisualCursor(): VisualCursor {
  if (!singletonCursor) {
    singletonCursor = new VisualCursor();
  }

  return singletonCursor;
}

function computeControlPoint(start: Point, end: Point): Point {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const magnitude = clamp(Math.hypot(dx, dy) * 0.14, 12, 38);

  return {
    x: midX - (dy / (Math.hypot(dx, dy) || 1)) * magnitude,
    y: midY + (dx / (Math.hypot(dx, dy) || 1)) * magnitude
  };
}

function quadraticPoint(start: number, control: number, end: number, t: number): number {
  const inverse = 1 - t;
  return inverse * inverse * start + 2 * inverse * t * control + t * t * end;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
