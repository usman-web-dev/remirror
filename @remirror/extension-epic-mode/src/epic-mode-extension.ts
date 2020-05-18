import {
  AnyExtension,
  createTypedExtension,
  EditorSchema,
  EditorView,
  randomInt,
  throttle,
} from '@remirror/core';
import { Plugin } from '@remirror/pm/state';

import { defaultEffect, PARTICLE_NUM_RANGE, VIBRANT_COLORS } from './epic-mode-effects';
import { EpicModeProperties, Particle } from './epic-mode-types';

export const EpicModeExtension = createTypedExtension<{}, EpicModeProperties>().plain({
  name: 'epicMode',
  defaultProperties: {
    particleEffect: defaultEffect,
    getCanvasContainer: () => document.body,
    colors: VIBRANT_COLORS,
    particleRange: PARTICLE_NUM_RANGE,
    active: true,
    shakeTime: 0.3,
    shakeIntensity: 5,
  },
  createPlugin(parameter) {
    const { extension, key } = parameter;
    const pluginState = new EpicModePluginState(extension);

    return new Plugin<EpicModePluginState, EditorSchema>({
      key,
      state: {
        init() {
          return pluginState;
        },
        apply(_tr, pluginState) {
          return pluginState;
        },
      },
      props: {
        handleKeyPress() {
          pluginState.shake();
          pluginState.spawnParticles();

          return false;
        },
      },
      view(view) {
        pluginState.init(view);

        return {
          destroy() {
            pluginState.destroy();
          },
        };
      },
    });
  },
});

function getRGBComponents(node: Element) {
  const color = getComputedStyle(node).color;
  let match: RegExpMatchArray | null;

  if (color && (match = color.match(/(\d+), (\d+), (\d+)/))) {
    try {
      return match.slice(1);
    } catch {
      return [255, 255, 255];
    }
  } else {
    return [255, 255, 255];
  }
}

export class EpicModePluginState {
  public canvas!: HTMLCanvasElement;
  public ctx!: CanvasRenderingContext2D;

  get properties() {
    return this.#extension.properties;
  }

  /* eslint-disable @typescript-eslint/explicit-member-accessibility */
  readonly #extension: AnyExtension<{}, EpicModeProperties>;
  #container!: HTMLElement;
  #shakeTime = 0;
  #shakeTimeMax = 0;
  #lastTime = 0;
  #particles: Particle[] = [];
  #isActive = false;
  #view!: EditorView;
  /* eslint-enable @typescript-eslint/explicit-member-accessibility */

  constructor(extension: AnyExtension<{}, EpicModeProperties>) {
    this.#extension = extension;

    // Throttle methods
    this.shake = throttle(100, this.shake);
    this.spawnParticles = throttle(100, this.spawnParticles);
  }

  /**
   * Store a reference to the Prosemirror view and add the canvas to the DOM
   *
   * @param view
   */
  public init(view: EditorView) {
    this.#view = view;
    this.#container = this.properties.getCanvasContainer();

    const canvas = document.createElement('canvas');
    this.canvas = canvas;
    canvas.id = 'epic-mode-canvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '1';
    canvas.style.pointerEvents = 'none';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('An error occurred while creating the canvas context');
    }

    this.ctx = ctx;
    this.#container.append(this.canvas);
    this.#isActive = true;
    this.loop();

    return this;
  }

  public destroy() {
    // Wrapped in try catch for support of hot module reloading during development
    try {
      this.#isActive = false;
      this.canvas.remove();
      if (this.#container.contains(this.canvas)) {
        this.canvas.remove();
      }
    } catch (error) {
      console.warn(error);
    }
  }

  public shake = () => {
    if (this.properties.active) {
      this.#shakeTime = this.#shakeTimeMax = this.properties.shakeTime;
    }
  };

  public spawnParticles = () => {
    const { selection } = this.#view.state;
    const coords = this.#view.coordsAtPos(selection.$anchor.pos);

    // Move the canvas
    this.canvas.style.top = `${window.scrollY}px`;
    this.canvas.style.left = `${window.scrollX}px`;

    const node = document.elementFromPoint(coords.left - 5, coords.top + 5);
    if (!node) {
      return;
    }

    const numParticles = randomInt(
      this.properties.particleRange.min,
      this.properties.particleRange.max,
    );
    const textColor = getRGBComponents(node);
    for (let ii = 0; ii < numParticles; ii++) {
      const colorCode = this.properties.colors[ii % this.properties.colors.length];
      const r = Number.parseInt(colorCode.slice(1, 3), 16);
      const g = Number.parseInt(colorCode.slice(3, 5), 16);
      const b = Number.parseInt(colorCode.slice(5, 7), 16);
      const color = [r, g, b];

      this.#particles[ii] = this.properties.particleEffect.createParticle({
        x: coords.left + 10,
        y: coords.top - 10,
        color,
        textColor,
        ctx: this.ctx,
        canvas: this.canvas,
      });
    }
  };

  /**
   * Runs through the animation loop
   */
  public loop = () => {
    if (!this.#isActive) {
      return;
    }

    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // get the time past the previous frame
    const currentTime = new Date().getTime();
    if (!this.#lastTime) {
      this.#lastTime = currentTime;
    }
    const dt = (currentTime - this.#lastTime) / 1000;
    this.#lastTime = currentTime;

    if (this.#shakeTime > 0) {
      this.#shakeTime -= dt;
      const magnitude = (this.#shakeTime / this.#shakeTimeMax) * this.properties.shakeIntensity;
      const shakeX = randomInt(-magnitude, magnitude);
      const shakeY = randomInt(-magnitude, magnitude);
      (this.#view.dom as HTMLElement).style.transform = `translate(${shakeX}px,${shakeY}px)`;
    }
    this.drawParticles();
    requestAnimationFrame(this.loop);
  };

  private drawParticles() {
    for (const particle of this.#particles) {
      if (particle.alpha < 0.01 || particle.size <= 0.5) {
        continue;
      }

      this.properties.particleEffect.updateParticle({
        particle,
        ctx: this.ctx,
        canvas: this.canvas,
      });
    }
  }
}
